package com.legend.warehouse;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.legend.warehouse.server.Identity;
import com.legend.warehouse.server.WarehouseServer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Tokens: refreshing one keeps a page signed in, never past the sign-in's session limit. */
class IdentityTest {

    /** A clock the test moves. */
    static final class Moving extends Clock {
        Instant now = Instant.parse("2026-09-29T09:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static final byte[] KEY = new byte[32];

    private static Identity identity(Moving clock) {
        Identity id = new Identity(KEY, Duration.ofHours(1), Duration.ofHours(3), clock);
        id.addUser("rita", "rita-pw");
        return id;
    }

    @Test
    void aRefreshedTokenIsTheSameUserWithANewExpiry() {
        Moving clock = new Moving();
        Identity id = identity(clock);
        Identity.Issued first = id.login("rita", "rita-pw");
        assertNotNull(first);
        clock.advance(Duration.ofMinutes(50));
        Identity.Issued next = id.refresh(first.token());
        assertNotNull(next);
        assertEquals("rita", next.principal());
        assertEquals(clock.now.plus(Duration.ofHours(1)), next.expires());
        assertNotEquals(first.token(), next.token());
        clock.advance(Duration.ofMinutes(30));
        assertNull(id.verify(first.token()), "the old token still expires when it said it would");
        assertEquals("rita", id.verify(next.token()));
    }

    @Test
    void refreshingNeverReachesPastTheSessionLimit() {
        Moving clock = new Moving();
        Identity id = identity(clock);
        Identity.Issued t = id.login("rita", "rita-pw");
        assertNotNull(t);
        Instant signedIn = clock.now;
        for (int i = 0; i < 5; i++) {
            clock.advance(Duration.ofMinutes(45));
            Identity.Issued next = id.refresh(t.token());
            if (next == null) break;
            assertTrue(!next.expires().isAfter(signedIn.plus(Duration.ofHours(3))), "past the 3h limit: " + next.expires());
            t = next;
        }
        assertEquals(signedIn.plus(Duration.ofHours(3)), t.expires(), "the last refresh stops at the limit");
        clock.advance(Duration.between(clock.now, t.expires()));
        assertNull(id.refresh(t.token()), "at the limit, only the password signs in again");
    }

    @Test
    void anExpiredOrForgedTokenIsNotRefreshed() {
        Moving clock = new Moving();
        Identity id = identity(clock);
        Identity.Issued t = id.login("rita", "rita-pw");
        assertNotNull(t);
        assertNull(id.refresh(t.token().substring(0, t.token().indexOf('.')) + ".AAAA"));
        assertNull(id.refresh(null));
        clock.advance(Duration.ofMinutes(61));
        assertNull(id.refresh(t.token()), "an expired token is not brought back");
    }

    @Test
    void aKeptKeySurvivesARestartAndIsTheOwnersOnly(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("token.key");
        byte[] made = WarehouseServer.tokenKey(file);
        assertEquals(32, made.length);
        assertArrayEquals(made, WarehouseServer.tokenKey(file), "a second start reads the same key");
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(file)));
        }
        // a token from one process verifies in the next, given the same key
        Moving clock = new Moving();
        Identity before = new Identity(made, Duration.ofHours(1), clock);
        before.addUser("rita", "rita-pw");
        Identity after = new Identity(WarehouseServer.tokenKey(file), Duration.ofHours(1), clock);
        after.addUser("rita", "rita-pw");
        Identity.Issued t = before.login("rita", "rita-pw");
        assertNotNull(t);
        assertEquals("rita", after.verify(t.token()));
    }
}
