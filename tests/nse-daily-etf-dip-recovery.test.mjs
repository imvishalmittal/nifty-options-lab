import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustForUnitChanges,
  nseBhavcopyUrl,
  parseNseBhavcopy,
} from '../research/nse-daily-etf-dip-recovery-backtest.mjs';

test('NSE archive URL switches to UDiFF on 8 July 2024', () => {
  assert.equal(
    nseBhavcopyUrl('2024-01-02'),
    'https://archives.nseindia.com/content/historical/EQUITIES/2024/JAN/cm02JAN2024bhav.csv.zip',
  );
  assert.equal(
    nseBhavcopyUrl('2024-07-08'),
    'https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20240708_F_0000.csv.zip',
  );
});

test('legacy and UDiFF bhavcopies normalize to the same daily bar shape', () => {
  const allowed = new Set(['GOLDBEES']);
  const legacy = parseNseBhavcopy(
    'SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,\nGOLDBEES,EQ,50,52,49,51,51,50,600001,1,02-JAN-2024,2,INF,\n',
    '2024-01-02',
    allowed,
  );
  const udiff = parseNseBhavcopy(
    'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4\n2024-08-01,2024-08-01,CM,NSE,STK,1,INF,GOLDBEES,EQ,,,,,Gold ETF,50,52,49,51,51,50,,51,,,600001,1,2,F1,1,,,,,\n',
    '2024-08-01',
    allowed,
  );
  assert.deepEqual(legacy[0], { date: '2024-01-02', symbol: 'GOLDBEES', open: 50, high: 52, low: 49, close: 51, volume: 600001 });
  assert.deepEqual(udiff[0], { date: '2024-08-01', symbol: 'GOLDBEES', open: 50, high: 52, low: 49, close: 51, volume: 600001 });
});

test('split-like unit changes adjust historical prices but preserve historical volume', () => {
  const adjusted = adjustForUnitChanges([
    { date: '2025-01-01', open: 490, high: 510, low: 480, close: 500, volume: 100_000 },
    { date: '2025-01-02', open: 49, high: 52, low: 48, close: 50, volume: 1_000_000 },
  ]);
  assert.equal(adjusted.events.length, 1);
  assert.equal(adjusted.events[0].adjustmentFactor, 0.1);
  assert.equal(adjusted.bars[0].close, 50);
  assert.equal(adjusted.bars[0].volume, 100_000);
});
