# Seed data: engine vs lite disagreements (2026-09-30)

## SPELLING  A1_FactRollup_suite___expected_rows  (94-fanout-services.pure)

    |reporting::TradeFact.all() ->groupBy( [x|$x.bookId], [agg(x|$x.notional, y|$y->sum())], ['bookId', 'totalNotional'] )

  engine only rows:
    {"bookId": "BK-CASH-EU", "totalNotional": 924850.0}
  lite only rows:
    {"bookId": "BK-CASH-US", "totalNotional": 2961025.0}
  (3 engine rows, 3 lite rows)

## COUNT  CV6_PillarEmptiness_suite___expected_rows  (94-fanout-services.pure)

    |curves::CurvePoint.all() ->project(~[ curveId:x|$x.curveId, cobDate:x|$x.cobDate, tenorLabel:x|$x.tenorLabel, tenorDays:x|$x.tenorDays, isLastPillar:x|$x.longerPillars->isEmpty() ]) ->sort([~curveId->ascending(), ~cobDate->ascending(), ~tenorLabel->ascending(

  engine only rows:
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["isLastPillar", false], ["tenorDays", 3653], ["tenorLabel", "10Y"]]
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["isLastPillar", false], ["tenorDays", 3653], ["tenorLabel", "10Y"]]
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["isLastPillar", false], ["tenorDays", 5479], ["tenorLabel", "15Y"]]
  lite only rows:
  (1072 engine rows, 192 lite rows)

## VALUES  CV7_PillarsShorter_suite___expected_rows  (94-fanout-services.pure)

    |curves::CurvePoint.all() ->filter({x|($x.tenorLabel != '1M')}) ->project(~[ curveId:x|$x.curveId, cobDate:x|$x.cobDate, tenorLabel:x|$x.tenorLabel, tenorDays:x|$x.tenorDays, pillarsNearerIn:x|$x.shorterPillars->count() ]) ->sort([~curveId->ascending(), ~cobDa

  engine only rows:
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["pillarsNearerIn", 3], ["tenorDays", 3653], ["tenorLabel", "10Y"]]
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["pillarsNearerIn", 2], ["tenorDays", 5479], ["tenorLabel", "15Y"]]
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["pillarsNearerIn", 8], ["tenorDays", 365], ["tenorLabel", "1Y"]]
  lite only rows:
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["pillarsNearerIn", 8], ["tenorDays", 3653], ["tenorLabel", "10Y"]]
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["pillarsNearerIn", 9], ["tenorDays", 5479], ["tenorLabel", "15Y"]]
    [["cobDate", "2024-06-19"], ["curveId", "EUR.DBR.GOVT"], ["pillarsNearerIn", 3], ["tenorDays", 365], ["tenorLabel", "1Y"]]
  (176 engine rows, 176 lite rows)

## LITE-ONLY  DSDeep_HypotheticalPnL_suite___expected_rows  (94-fanout-services.pure)

    |pnl::HypotheticalPnL.all() ->filter({x|($x.dailyPnL.book.desk.businessUnit.name > ' ') && ($x.currency > ' ')}) ->project(~[ hypotheticalId:x|$x.hypotheticalId, dailyPnLBookDeskBusinessUnitName:x|$x.dailyPnL.book.desk.businessUnit.name, dailyPnLTraderDeskBusi

  engine produced no rows (errored)

## ENGINE-ONLY  DSDeep_HypotheticalPnl_suite___expected_rows  (94-fanout-services.pure)

    |bookclosure::HypotheticalPnl.all() ->filter({x|($x.book.desk.businessUnit.legalEntity.jurisdiction > ' ')}) ->project(~[ recordId:x|$x.recordId, bookDeskBusinessUnitLegalEntityJurisdiction:x|$x.book.desk.businessUnit.legalEntity.jurisdiction, bookDeskBusiness

  lite produced no rows (failed, skipped, or an excluded file)

## LITE-ONLY  DSGroup_HypotheticalPnL_suite___expected_rows  (94-fanout-services.pure)

    |pnl::HypotheticalPnL.all() ->filter({x|($x.dailyPnL.book.desk.businessUnit.name > ' ')}) ->project(~[ dailyPnLBookDeskBusinessUnitName:x|$x.dailyPnL.book.desk.businessUnit.name, hypotheticalId:x|$x.hypotheticalId ]) ->groupBy(~[dailyPnLBookDeskBusinessUnitNam

  engine produced no rows (errored)

## ENGINE-ONLY  DSGroup_HypotheticalPnl_suite___expected_rows  (94-fanout-services.pure)

    |bookclosure::HypotheticalPnl.all() ->filter({x|($x.book.desk.businessUnit.legalEntity.jurisdiction > ' ')}) ->project(~[ bookDeskBusinessUnitLegalEntityJurisdiction:x|$x.book.desk.businessUnit.legalEntity.jurisdiction, recordId:x|$x.recordId ]) ->groupBy(~[bo

  lite produced no rows (failed, skipped, or an excluded file)

## VALUES  DSLocal_ExposureLine_suite___expected_rows  (94-fanout-services.pure)

    |largeexp::ExposureLine.all() ->filter({x|($x.counterpartyId > ' ')}) ->project(~[ reportId:x|$x.reportId, cobDate:x|$x.cobDate, lineNumber:x|$x.lineNumber, counterpartyId:x|$x.counterpartyId, headroomToLimit:x|$x.headroomToLimit ]) ->sort([~reportId->ascendin

  engine only rows:
    [["cobDate", "2024-03-28"], ["counterpartyId", "CP-0003"], ["headroomToLimit", -4.799999], ["lineNumber", 2], ["reportId", "LE-2024Q1-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0001"], ["headroomToLimit", 6.6000004], ["lineNumber", 1], ["reportId", "LE-2024Q2-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0003"], ["headroomToLimit", -6.700001], ["lineNumber", 3], ["reportId", "LE-2024Q2-01"]]
  lite only rows:
    [["cobDate", "2024-03-28"], ["counterpartyId", "CP-0003"], ["headroomToLimit", -4.8], ["lineNumber", 2], ["reportId", "LE-2024Q1-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0001"], ["headroomToLimit", 6.6], ["lineNumber", 1], ["reportId", "LE-2024Q2-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0003"], ["headroomToLimit", -6.7], ["lineNumber", 3], ["reportId", "LE-2024Q2-01"]]
  (12 engine rows, 12 lite rows)

## VALUES  DSLocal_MiddleofficeConfirmation_suite___expected_rows  (94-fanout-services.pure)

    |middleoffice::Confirmation.all() ->filter({x|($x.status > ' ')}) ->project(~[ confirmationId:x|$x.confirmationId, status:x|$x.status, chaseCount:x|$x.chaseCount, hoursToMatch:x|$x.hoursToMatch ]) ->sort(~confirmationId->ascending()) ->limit(25)

  engine only rows:
    [["chaseCount", 5], ["confirmationId", "CNF-00005"], ["hoursToMatch", 164], ["status", "MATCHED"]]
  lite only rows:
    [["chaseCount", 5], ["confirmationId", "CNF-00005"], ["hoursToMatch", 163], ["status", "MATCHED"]]
  (5 engine rows, 5 lite rows)

## VALUES  DSLocal_RegulatorySubmission_suite___expected_rows  (94-fanout-services.pure)

    |regreporting::RegulatorySubmission.all() ->filter({x|($x.status > ' ')}) ->project(~[ submissionId:x|$x.submissionId, status:x|$x.status, recordCount:x|$x.recordCount, ackHours:x|$x.ackHours ]) ->sort(~submissionId->ascending()) ->limit(25)

  engine only rows:
    [["ackHours", -3], ["recordCount", 2329], ["status", "ACCEPTED"], ["submissionId", "REG-00017"]]
  lite only rows:
    [["ackHours", -2], ["recordCount", 2329], ["status", "ACCEPTED"], ["submissionId", "REG-00017"]]
  (16 engine rows, 16 lite rows)

## LITE-ONLY  DSPost_HypotheticalPnL_suite___expected_rows  (94-fanout-services.pure)

    |pnl::HypotheticalPnL.all() ->project(~[ hypotheticalId:x|$x.hypotheticalId, dailyPnLBookDeskBusinessUnitName:x|$x.dailyPnL.book.desk.businessUnit.name, dailyPnLTraderDeskBusinessUnitName:x|$x.dailyPnL.trader.desk.businessUnit.name, dailyPnLDeskBusinessUnitLeg

  engine produced no rows (errored)

## ENGINE-ONLY  DSPost_HypotheticalPnl_suite___expected_rows  (94-fanout-services.pure)

    |bookclosure::HypotheticalPnl.all() ->project(~[ recordId:x|$x.recordId, bookDeskBusinessUnitLegalEntityJurisdiction:x|$x.book.desk.businessUnit.legalEntity.jurisdiction, bookDeskBusinessUnitName:x|$x.book.desk.businessUnit.name, bookRollupBookId:x|$x.book.rol

  lite produced no rows (failed, skipped, or an excluded file)

## LITE-ONLY  DSTree_HypotheticalPnL_suite___expected_rows  (94-fanout-services.pure)

    |pnl::HypotheticalPnL.all() ->graphFetch(#{ pnl::HypotheticalPnL { hypotheticalId, dailyPnL { book { desk { businessUnit { buId } } } } } }#) ->serialize(#{ pnl::HypotheticalPnL { hypotheticalId, dailyPnL { book { desk { businessUnit { buId } } } } } }#)

  engine produced no rows (errored)

## ENGINE-ONLY  DSTree_HypotheticalPnl_suite___expected_rows  (94-fanout-services.pure)

    |bookclosure::HypotheticalPnl.all() ->graphFetch(#{ bookclosure::HypotheticalPnl { recordId, book { desk { businessUnit { legalEntity { leId } } } } } }#) ->serialize(#{ bookclosure::HypotheticalPnl { recordId, book { desk { businessUnit { legalEntity { leId }

  lite produced no rows (failed, skipped, or an excluded file)

## VALUES  F0_InstrumentChildCounts_suite___expected_rows  (94-fanout-services.pure)

    |products::Instrument.all() ->project(~[ instrumentId:x|$x.instrumentId, name:x|$x.name, ticker:x|$x.ticker, assetClass:x|$x.assetClass, isActive:x|$x.isActive, tradeCount:x|$x.trades->count(), positionCount:x|$x.positions->count(), greeksCount:x|$x.instrument

  engine only rows:
    [["assetClass", "EQUITY"], ["greeksCount", 1], ["instrumentId", "INST-HSBA"], ["isActive", true], ["name", "HSBC Holdings plc"], ["positionCount", 1], ["ticker", "HSBA"], ["tradeCount", 3]]
    [["assetClass", "EQUITY"], ["greeksCount", 1], ["instrumentId", "INST-SAP"], ["isActive", true], ["name", "SAP SE"], ["positionCount", 1], ["ticker", "SAP"], ["tradeCount", 2]]
    [["assetClass", "EQUITY"], ["greeksCount", 1], ["instrumentId", "INST-NESN"], ["isActive", false], ["name", "Nestle SA"], ["positionCount", 1], ["ticker", "NESN"], ["tradeCount", 1]]
  lite only rows:
    [["assetClass", "EQUITY"], ["greeksCount", 0], ["instrumentId", "INST-HSBA"], ["isActive", true], ["name", "HSBC Holdings plc"], ["positionCount", 1], ["ticker", "HSBA"], ["tradeCount", 3]]
    [["assetClass", "EQUITY"], ["greeksCount", 0], ["instrumentId", "INST-SAP"], ["isActive", true], ["name", "SAP SE"], ["positionCount", 1], ["ticker", "SAP"], ["tradeCount", 2]]
    [["assetClass", "EQUITY"], ["greeksCount", 0], ["instrumentId", "INST-NESN"], ["isActive", false], ["name", "Nestle SA"], ["positionCount", 1], ["ticker", "NESN"], ["tradeCount", 0]]
  (6 engine rows, 6 lite rows)

## VALUES  F1_CounterpartyChildCounts_suite___expected_rows  (94-fanout-services.pure)

    |counterparty::Counterparty.all() ->project(~[ counterpartyId:x|$x.counterpartyId, legalName:x|$x.legalName, tier:x|$x.tier, isActive:x|$x.isActive, countryName:x|$x.country.name, tradeCount:x|$x.trades->count(), settlementCount:x|$x.settlementsWithCpty->count

  engine only rows:
    [["counterpartyId", "CP-0004"], ["countryName", "Japan"], ["csaCount", 1], ["isActive", false], ["legalName", "Halberd Securities"], ["settlementCount", 2], ["tier", 3], ["tradeCount", 2]]
    [["counterpartyId", "CP-0005"], ["countryName", "United Kingdom"], ["csaCount", 1], ["isActive", true], ["legalName", "Kestrel Pension Trust"], ["settlementCount", 1], ["tier", 2], ["tradeCount", 1]]
  lite only rows:
    [["counterpartyId", "CP-0004"], ["countryName", "Japan"], ["csaCount", 0], ["isActive", false], ["legalName", "Halberd Securities"], ["settlementCount", 2], ["tier", 3], ["tradeCount", 2]]
    [["counterpartyId", "CP-0005"], ["countryName", "United Kingdom"], ["csaCount", 0], ["isActive", true], ["legalName", "Kestrel Pension Trust"], ["settlementCount", 0], ["tier", 2], ["tradeCount", 0]]
  (5 engine rows, 5 lite rows)

## VALUES  F2_BookChildCounts_suite___expected_rows  (94-fanout-services.pure)

    |positions::Book.all() ->project(~[ bookId:x|$x.bookId, name:x|$x.name, currency:x|$x.currency, isActive:x|$x.isActive, deskName:x|$x.desk.name, deskRegion:x|$x.desk.region, tradeCount:x|$x.trades->count(), positionCount:x|$x.positions->count(), pnlCount:x|$x.

  engine only rows:
    [["bookId", "BK-LEGACY"], ["currency", "GBP"], ["deskName", "Equity Derivatives"], ["deskRegion", "EMEA"], ["isActive", false], ["name", "Legacy Wind-down"], ["pnlCount", 1], ["positionCount", 1], ["tradeCount", 1]]
    [["bookId", "BK-EQ"], ["currency", "USD"], ["deskName", "Cash Equities"], ["deskRegion", "Americas"], ["isActive", true], ["name", "Equity derivatives"], ["pnlCount", 1], ["positionCount", 1], ["tradeCount", 1]]
    [["bookId", "BK-FX"], ["currency", "USD"], ["deskName", "Cash Equities"], ["deskRegion", "Americas"], ["isActive", true], ["name", "FX trading"], ["pnlCount", 1], ["positionCount", 1], ["tradeCount", 1]]
  lite only rows:
    [["bookId", "BK-LEGACY"], ["currency", "GBP"], ["deskName", "Equity Derivatives"], ["deskRegion", "EMEA"], ["isActive", false], ["name", "Legacy Wind-down"], ["pnlCount", 0], ["positionCount", 1], ["tradeCount", 0]]
    [["bookId", "BK-EQ"], ["currency", "USD"], ["deskName", "Cash Equities"], ["deskRegion", "Americas"], ["isActive", true], ["name", "Equity derivatives"], ["pnlCount", 0], ["positionCount", 0], ["tradeCount", 0]]
    [["bookId", "BK-FX"], ["currency", "USD"], ["deskName", "Cash Equities"], ["deskRegion", "Americas"], ["isActive", true], ["name", "FX trading"], ["pnlCount", 0], ["positionCount", 0], ["tradeCount", 0]]
  (8 engine rows, 8 lite rows)

## VALUES  F35_DayOfYear_suite___june_third  (76-dayofyear.pure)

    |doy::Day.all()->project( ~[ doy:x|$x.dayOfYear, dom:x|$x.dayOfMonth, mon:x|$x.monthNumber, wk:x|$x.weekOfYear ])

  engine only rows:
    [["dom", 3], ["doy", 3], ["mon", 6], ["wk", 23]]
  lite only rows:
    [["dom", 3], ["doy", 155], ["mon", 6], ["wk", 23]]
  (1 engine rows, 1 lite rows)

## ENGINE-ONLY  F37_SubstringPure_suite___zero_based_exclusive_end  (77-substring-paths.pure)

    |sub::Out.all()->graphFetch(#{ sub::Out { viaPure } }#) ->serialize(#{ sub::Out { viaPure } }#)

  lite produced no rows (failed, skipped, or an excluded file)

## SPELLING  F38_FirstDayTypes_suite___all_four_are_dates  (78-firstday-types.pure)

    |fdw::Week.all()->project( ~[ mon:x|$x.ofMonth, qtr:x|$x.ofQuarter, yr:x|$x.ofYear, wk:x|$x.ofWeek ])

  engine only rows:
    {"mon": "2024-06-01", "qtr": "2024-04-01", "wk": "2024-06-03T00:00:00.000000000+0000", "yr": "2024-01-01"}
  lite only rows:
    {"mon": "2024-06-01", "qtr": "2024-04-01", "wk": "2024-06-03", "yr": "2024-01-01"}
  (1 engine rows, 1 lite rows)

## VALUES  F39_NullBoolean_suite___three_valued  (79-null-boolean.pure)

    |nb::Row.all()->project( ~[ stored:x|$x.stored, starts:x|$x.starts, ends:x|$x.ends, has:x|$x.has, isNul:x|$x.isNul, eq:x|$x.eq, startsCol:x|$x.startsCol, endsCol:x|$x.endsCol, hasCol:x|$x.hasCol ])

  engine only rows:
    [["ends", true], ["endsCol", false], ["eq", false], ["has", true], ["hasCol", false], ["isNul", false], ["starts", true], ["startsCol", false], ["stored", null]]
    [["ends", true], ["endsCol", false], ["eq", false], ["has", true], ["hasCol", false], ["isNul", false], ["starts", true], ["startsCol", false], ["stored", null]]
  lite only rows:
    [["ends", true], ["endsCol", null], ["eq", false], ["has", true], ["hasCol", null], ["isNul", false], ["starts", true], ["startsCol", null], ["stored", null]]
    [["ends", true], ["endsCol", true], ["eq", false], ["has", true], ["hasCol", true], ["isNul", false], ["starts", true], ["startsCol", true], ["stored", null]]
  (4 engine rows, 4 lite rows)

## VALUES  F3_DeskChildCounts_suite___expected_rows  (94-fanout-services.pure)

    |org::Desk.all() ->project(~[ deskId:x|$x.deskId, name:x|$x.name, region:x|$x.region, assetClass:x|$x.assetClass, isActive:x|$x.isActive, bookCount:x|$x.books->count(), traderCount:x|$x.traders->count(), pnlCount:x|$x.dailyPnLs->count() ])

  engine only rows:
    [["assetClass", "CREDIT"], ["bookCount", 1], ["deskId", "DSK-CREDIT"], ["isActive", false], ["name", "Credit Trading"], ["pnlCount", 1], ["region", "Americas"], ["traderCount", 1]]
  lite only rows:
    [["assetClass", "CREDIT"], ["bookCount", 0], ["deskId", "DSK-CREDIT"], ["isActive", false], ["name", "Credit Trading"], ["pnlCount", 0], ["region", "Americas"], ["traderCount", 0]]
  (3 engine rows, 3 lite rows)

## COUNT  F41_RelationFirst_suite___one_row  (80-relation-first.pure)

    |rf::P.all()->project(~[g:x|$x.g, v:x|$x.v]) ->sort([~v->ascending(), ~g->ascending()]) ->first()

  engine only rows:
    [["g", "b"], ["v", 1]]
    [["g", "a"], ["v", 3]]
    [["g", "b"], ["v", 4]]
  lite only rows:
  (4 engine rows, 1 lite rows)

## VALUES  F4_SectorInstrumentCounts_suite___expected_rows  (94-fanout-services.pure)

    |refdata::Sector.all() ->project(~[ sectorId:x|$x.sectorId, name:x|$x.name, gicsCode:x|$x.gicsCode, isActive:x|$x.isActive, instrumentCount:x|$x.instruments->count() ])

  engine only rows:
    [["gicsCode", 55], ["instrumentCount", 1], ["isActive", false], ["name", "Utilities"], ["sectorId", "SEC-55"]]
  lite only rows:
    [["gicsCode", 55], ["instrumentCount", 0], ["isActive", false], ["name", "Utilities"], ["sectorId", "SEC-55"]]
  (4 engine rows, 4 lite rows)

## VALUES  F6_PositionGreeksCounts_suite___expected_rows  (94-fanout-services.pure)

    |positions::Position.all() ->project(~[ positionId:x|$x.positionId, direction:x|$x.direction, currency:x|$x.currency, isOpen:x|$x.isOpen, instrumentName:x|$x.instrument.name, greeksCount:x|$x.greeks->count() ])

  engine only rows:
    [["currency", "GBP"], ["direction", "SHORT"], ["greeksCount", 1], ["instrumentName", "HSBC Holdings plc"], ["isOpen", true], ["positionId", "POS-0003"]]
    [["currency", "GBP"], ["direction", "LONG"], ["greeksCount", 1], ["instrumentName", "SAP SE"], ["isOpen", true], ["positionId", "POS-0004"]]
    [["currency", "GBP"], ["direction", "FLAT"], ["greeksCount", 1], ["instrumentName", "Nestle SA"], ["isOpen", false], ["positionId", "POS-0006"]]
  lite only rows:
    [["currency", "GBP"], ["direction", "SHORT"], ["greeksCount", 0], ["instrumentName", "HSBC Holdings plc"], ["isOpen", true], ["positionId", "POS-0003"]]
    [["currency", "GBP"], ["direction", "LONG"], ["greeksCount", 0], ["instrumentName", "SAP SE"], ["isOpen", true], ["positionId", "POS-0004"]]
    [["currency", "GBP"], ["direction", "FLAT"], ["greeksCount", 0], ["instrumentName", "Nestle SA"], ["isOpen", false], ["positionId", "POS-0006"]]
  (6 engine rows, 6 lite rows)

## LITE-ONLY  G3_UnionTreeWithEnum_suite___expected_rows  (94-fanout-services.pure)

    |trading::HistTrade.all() ->graphFetch(#{ trading::HistTrade { tradeId, side, notional, status } }#) ->serialize(#{ trading::HistTrade { tradeId, side, notional, status } }#)

  engine produced no rows (errored)

## ENGINE-ONLY  H_Bond_suite___expected_rows  (97-hier-execution.pure)

    |hier::Bond.all() ->project(~[ instrumentId:x|$x.instrumentId, assetClass:x|$x.assetClass, coupon:x|$x.coupon, name:x|$x.name ]) ->sort(~instrumentId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_InstrumentReach_suite___expected_rows  (97-hier-execution.pure)

    |hier::InstrumentReach.all() ->project(~[ instrumentId:x|$x.instrumentId, upperCountry:x|$x.upperCountry, countryName:x|$x.countryName ]) ->sort(~instrumentId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_Instrument_suite___expected_rows  (97-hier-execution.pure)

    |hier::Instrument.all() ->project(~[ instrumentId:x|$x.instrumentId, assetClass:x|$x.assetClass, name:x|$x.name ]) ->sort(~instrumentId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_IssuerBindingBool_suite___expected_rows  (97-hier-execution.pure)

    |hier::Issuer.all() ->project(~[ issuerId:x|$x.issuerId, profile_flagged:x|$x.profile.flagged ]) ->sort(~issuerId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_IssuerBinding_suite___expected_rows  (97-hier-execution.pure)

    |hier::Issuer.all() ->project(~[ issuerId:x|$x.issuerId, profile_headquarters:x|$x.profile.headquarters, profile_sector:x|$x.profile.sector ]) ->sort(~issuerId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_IssuerLabel_suite___expected_rows  (97-hier-execution.pure)

    |hier::IssuerLabel.all() ->project(~[ issuerId:x|$x.issuerId, fullLabel:x|$x.fullLabel, lowerName:x|$x.lowerName, upperName:x|$x.upperName ]) ->sort(~issuerId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_IssuerProd_suite___expected_rows  (97-hier-execution.pure)

    |hier::Issuer.all() ->project(~[ issuerId:x|$x.issuerId, contact_email:x|$x.contact.email, contact_phone:x|$x.contact.phone, legalName:x|$x.legalName ]) ->sort(~issuerId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_Issuer_suite___expected_rows  (97-hier-execution.pure)

    |hier::Issuer.all() ->project(~[ issuerId:x|$x.issuerId, contact_email:x|$x.contact.email, contact_phone:x|$x.contact.phone, legalName:x|$x.legalName ]) ->sort(~issuerId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  H_Option_suite___expected_rows  (97-hier-execution.pure)

    |hier::Option.all() ->project(~[ instrumentId:x|$x.instrumentId, assetClass:x|$x.assetClass, name:x|$x.name, strike:x|$x.strike ]) ->sort(~instrumentId->ascending())

  lite produced no rows (failed, skipped, or an excluded file)

## VALUES  LE0_ExposureLines_suite___expected_rows  (94-fanout-services.pure)

    |largeexp::ExposureLine.all() ->project(~[ reportId:x|$x.reportId, cobDate:x|$x.cobDate, lineNumber:x|$x.lineNumber, counterpartyId:x|$x.counterpartyId, groupId:x|$x.groupId, countryCode:x|$x.countryCode, exposureClass:x|$x.exposureClass, grossExposure:x|$x.gr

  engine only rows:
    [["cobDate", "2024-03-28"], ["counterpartyId", "CP-0003"], ["countryCode", "DE"], ["exposureClass", "CORPORATE"], ["grossExposure", 6900000000], ["groupId", "GRP-BETA"], ["headroomToLimit", -4.799999], ["isExempt", false], ["lineNumber", 2], ["mitigationRatio", 0.050724638], ["netExposure", 65500000
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0001"], ["countryCode", "US"], ["exposureClass", "INSTITUTION"], ["grossExposure", 4850000000], ["groupId", "GRP-ALPHA"], ["headroomToLimit", 6.6000004], ["isExempt", false], ["lineNumber", 1], ["mitigationRatio", 0.24742268], ["netExposure", 365000
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0003"], ["countryCode", "DE"], ["exposureClass", "CORPORATE"], ["grossExposure", 7400000000], ["groupId", "GRP-BETA"], ["headroomToLimit", -6.700001], ["isExempt", false], ["lineNumber", 3], ["mitigationRatio", 0.054054054], ["netExposure", 70000000
  lite only rows:
    [["cobDate", "2024-03-28"], ["counterpartyId", "CP-0003"], ["countryCode", "DE"], ["exposureClass", "CORPORATE"], ["grossExposure", 6900000000], ["groupId", "GRP-BETA"], ["headroomToLimit", -4.8], ["isExempt", false], ["lineNumber", 2], ["mitigationRatio", 0.050724638], ["netExposure", 6550000000], 
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0001"], ["countryCode", "US"], ["exposureClass", "INSTITUTION"], ["grossExposure", 4850000000], ["groupId", "GRP-ALPHA"], ["headroomToLimit", 6.6], ["isExempt", false], ["lineNumber", 1], ["mitigationRatio", 0.24742268], ["netExposure", 3650000000],
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0003"], ["countryCode", "DE"], ["exposureClass", "CORPORATE"], ["grossExposure", 7400000000], ["groupId", "GRP-BETA"], ["headroomToLimit", -6.7], ["isExempt", false], ["lineNumber", 3], ["mitigationRatio", 0.054054054], ["netExposure", 7000000000], 
  (12 engine rows, 12 lite rows)

## VALUES  LE2_ExemptionMatches_suite___expected_rows  (94-fanout-services.pure)

    |largeexp::ExposureLine.all() ->project(~[ reportId:x|$x.reportId, cobDate:x|$x.cobDate, lineNumber:x|$x.lineNumber, counterpartyId:x|$x.counterpartyId, countryCode:x|$x.countryCode, isExempt:x|$x.isExempt, matchingRules:x|$x.exemptionRules->count() ]) ->sort(

  engine only rows:
    [["cobDate", "2024-03-28"], ["counterpartyId", "CP-0001"], ["countryCode", "US"], ["isExempt", false], ["lineNumber", 1], ["matchingRules", 1], ["reportId", "LE-2024Q1-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0001"], ["countryCode", "US"], ["isExempt", false], ["lineNumber", 1], ["matchingRules", 1], ["reportId", "LE-2024Q2-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0002"], ["countryCode", "GB"], ["isExempt", false], ["lineNumber", 2], ["matchingRules", 1], ["reportId", "LE-2024Q2-01"]]
  lite only rows:
    [["cobDate", "2024-03-28"], ["counterpartyId", "CP-0001"], ["countryCode", "US"], ["isExempt", false], ["lineNumber", 1], ["matchingRules", 0], ["reportId", "LE-2024Q1-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0001"], ["countryCode", "US"], ["isExempt", false], ["lineNumber", 1], ["matchingRules", 0], ["reportId", "LE-2024Q2-01"]]
    [["cobDate", "2024-06-28"], ["counterpartyId", "CP-0002"], ["countryCode", "GB"], ["isExempt", false], ["lineNumber", 2], ["matchingRules", 0], ["reportId", "LE-2024Q2-01"]]
  (12 engine rows, 12 lite rows)

## ENGINE-ONLY  M1_TradeCanonical_suite___expected_rows  (94-fanout-services.pure)

    |canonical::CanonicalTrade.all() ->project( [ x|$x.identifier, x|$x.executedOn, x|$x.unitPrice, x|$x.units, x|$x.state, x|$x.grossValue ], ['identifier', 'executedOn', 'unitPrice', 'units', 'state', 'grossValue'] )

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  M2_CanonicalWithEnum_suite___expected_rows  (94-fanout-services.pure)

    |canonical::CanonicalTrade.all() ->project( [ x|$x.identifier, x|$x.side ], ['identifier', 'side'] )

  lite produced no rows (failed, skipped, or an excluded file)

## LITE-ONLY  MD7_UnrevisedPrintsEq_suite___expected_rows  (94-fanout-services.pure)

    |timeseries::Observation.all() ->filter({x|($x.isFinal == false)}) ->project(~[ obsId:x|$x.obsId, obsDate:x|$x.obsDate, obsValue:x|$x.obsValue, status:x|$x.status, isFinal:x|$x.isFinal, frequency:x|$x.series.frequency ]) ->sort(~obsId->ascending())

  engine produced no rows (errored)

## VALUES  MO2_Confirmations_suite___expected_rows  (94-fanout-services.pure)

    |middleoffice::Confirmation.all() ->project(~[ confirmationId:x|$x.confirmationId, method:x|$x.method, platform:x|$x.platform, status:x|$x.status, chaseCount:x|$x.chaseCount, hoursToMatch:x|$x.hoursToMatch, counterpartyId:x|$x.confirmedTrade.counterpartyId ]) 

  engine only rows:
    [["chaseCount", 5], ["confirmationId", "CNF-00005"], ["counterpartyId", "CP-0005"], ["hoursToMatch", 164], ["method", "EMAIL"], ["platform", null], ["status", "MATCHED"]]
  lite only rows:
    [["chaseCount", 5], ["confirmationId", "CNF-00005"], ["counterpartyId", "CP-0005"], ["hoursToMatch", 163], ["method", "EMAIL"], ["platform", null], ["status", "MATCHED"]]
  (5 engine rows, 5 lite rows)

## ENGINE-ONLY  MU0_MonetaryTrade_suite___expected_rows  (94-fanout-services.pure)

    |canonical::MonetaryTrade.all() ->graphFetch(#{ canonical::MonetaryTrade { identifier, amount } }#) ->serialize(#{ canonical::MonetaryTrade { identifier, amount } }#)

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  N4_TradeMultiExecution_suite___expected_rows_canonical__canonical_  (94-fanout-services.pure)

    |trading::Trade.all() ->project(~[ tradeId:x|$x.tradeId, tradeDate:x|$x.tradeDate, quantity:x|$x.quantity, price:x|$x.price, notional:x|$x.notional, side:x|$x.side, status:x|$x.status, currency:x|$x.currency, grossAmount:x|$x.grossAmount, instrName:x|$x.instru

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  N4_TradeMultiExecution_suite___expected_rows_flat__flat_  (94-fanout-services.pure)

    |trading::Trade.all() ->project(~[ tradeId:x|$x.tradeId, tradeDate:x|$x.tradeDate, quantity:x|$x.quantity, price:x|$x.price, notional:x|$x.notional, side:x|$x.side, status:x|$x.status, currency:x|$x.currency, grossAmount:x|$x.grossAmount, instrName:x|$x.instru

  lite produced no rows (failed, skipped, or an excluded file)

## SPELLING  PL5_ConvertedNotional_suite___expected_rows  (94-fanout-services.pure)

    |projectlink::PricedTrade.all() ->project(~[ tradeId:x|$x.tradeId, notional:x|$x.notional, fxMid:x|$x.fxMid, notionalConverted:x|$x.notionalConverted, backConverted:x|$x.backConverted ]) ->sort(~tradeId->ascending())

  engine only rows:
    {"backConverted": 190500.0, "fxMid": 1.0709, "notional": 190500.0, "notionalConverted": 204006.44999999998, "tradeId": "TRD-0001"}
  lite only rows:
    {"backConverted": 190500.0, "fxMid": 1.0709, "notional": 190500.0, "notionalConverted": 204006.44999999998, "tradeId": "TRD-0001"}
  (20 engine rows, 20 lite rows)

## VALUES  REGX_All_suite___expected_rows  (94-fanout-services.pure)

    |regreporting::RegulatorySubmission.all() ->project(~[ submissionId:x|$x.submissionId, reportType:x|$x.reportType, ackHours:x|$x.ackHours, authority:x|$x.authority, recordCount:x|$x.recordCount, rejectionReason:x|$x.rejectionReason ]) ->sort(~submissionId->asc

  engine only rows:
    [["ackHours", -3], ["authority", "ESMA"], ["recordCount", 2329], ["rejectionReason", null], ["reportType", "LIQUIDITY_COVERAGE"], ["submissionId", "REG-00017"]]
  lite only rows:
    [["ackHours", -2], ["authority", "ESMA"], ["recordCount", 2329], ["rejectionReason", null], ["reportType", "LIQUIDITY_COVERAGE"], ["submissionId", "REG-00017"]]
  (16 engine rows, 16 lite rows)

## VALUES  REGX_LiquidityCoverageReport_suite___expected_rows  (94-fanout-services.pure)

    |regreporting::LiquidityCoverageReport.all() ->project(~[ submissionId:x|$x.submissionId, reportType:x|$x.reportType, ackHours:x|$x.ackHours, authority:x|$x.authority, recordCount:x|$x.recordCount, rejectionReason:x|$x.rejectionReason ]) ->sort(~submissionId->

  engine only rows:
    [["ackHours", -3], ["authority", "ESMA"], ["recordCount", 2329], ["rejectionReason", null], ["reportType", "LIQUIDITY_COVERAGE"], ["submissionId", "REG-00017"]]
  lite only rows:
    [["ackHours", -2], ["authority", "ESMA"], ["recordCount", 2329], ["rejectionReason", null], ["reportType", "LIQUIDITY_COVERAGE"], ["submissionId", "REG-00017"]]
  (1 engine rows, 1 lite rows)

## ENGINE-ONLY  SP_IssuerProdIssuerGraph_suite___expected_rows  (94-fanout-services.pure)

    |hier::Issuer.all() ->graphFetch(#{ hier::Issuer { issuerId, legalName } }#) ->serialize(#{ hier::Issuer { issuerId, legalName } }#)

  lite produced no rows (failed, skipped, or an excluded file)

## ENGINE-ONLY  X0_TradeExternalEntity_suite___expected_rows  (94-fanout-services.pure)

    |trading::Trade.all() ->graphFetch(#{ trading::Trade { tradeId, notional, status, legalEntity { registeredName, jurisdiction, isSanctioned } } }#) ->serialize(#{ trading::Trade { tradeId, notional, status, legalEntity { registeredName, jurisdiction, isSanction

  lite produced no rows (failed, skipped, or an excluded file)

