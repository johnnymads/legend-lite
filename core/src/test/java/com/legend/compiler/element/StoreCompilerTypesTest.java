package com.legend.compiler.element;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.legend.compiler.element.type.Type;
import com.legend.model.RelationalDataType;
import org.junit.jupiter.api.Test;

/**
 * Every declared store type has a Pure type (docs/STORE_TYPES_HOMEWORK_2026_10_02.md, ruled
 * 2026-10-02): the kinds the grammar cannot spell -- DISTINCT, a typed ARRAY, OBJECT -- arrive
 * programmatically, from a database's own catalog, and are pinned here.
 */
class StoreCompilerTypesTest {

    private static final Type VARIANT = new Type.ClassType(com.legend.compiler.element.type.PlatformTypes.VARIANT);

    @Test
    void aTypePureCannotNameIsAString() {
        assertEquals(Type.Primitive.STRING, StoreCompiler.columnType(new RelationalDataType.Other()));
        assertEquals(Type.Primitive.STRING, StoreCompiler.columnType(new RelationalDataType.Distinct()));
    }

    @Test
    void aNestedValueIsAVariant() {
        assertEquals(VARIANT, StoreCompiler.columnType(new RelationalDataType.SemiStructured()));
        assertEquals(VARIANT, StoreCompiler.columnType(new RelationalDataType.Array(new RelationalDataType.Varchar(8))));
        assertEquals(VARIANT, StoreCompiler.columnType(
                new RelationalDataType.Object_(new RelationalDataType.Varchar(8), new RelationalDataType.Integer_())));
    }
}
