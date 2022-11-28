/* eslint-disable prefer-const */
import { PairHourData } from "../generated/schema";
import { BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import { Pair, Token, BullionFXFactory, BullionFXDayData, PairDayData, TokenDayData } from "../generated/schema";
import { ONE_BI, ZERO_BD, ZERO_BI, BULLIONFX_FACTORY_ADDRESS } from "./utils";

export function updateBullionFXDayData(event: ethereum.Event): BullionFXDayData | null {
  let bullionfx = BullionFXFactory.load(BULLIONFX_FACTORY_ADDRESS);
  if (bullionfx === null) {
    log.error(`updateBullionFXDayData: bullionfx {} not found`, [BULLIONFX_FACTORY_ADDRESS]);
    return null;
  }
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;

  let bullionFXDayData = BullionFXDayData.load(dayID.toString());
  if (bullionFXDayData === null) {
    bullionFXDayData = new BullionFXDayData(dayID.toString());
    bullionFXDayData.date = dayStartTimestamp;
    bullionFXDayData.dailyVolumeUSD = ZERO_BD;
    // bullionFXDayData.dailyVolumeBNB = ZERO_BD;
    bullionFXDayData.totalVolumeUSD = ZERO_BD;
    // bullionFXDayData.totalVolumeBNB = ZERO_BD;
    bullionFXDayData.dailyVolumeUntracked = ZERO_BD;
  }
  bullionFXDayData.totalLiquidityUSD = bullionfx.totalLiquidityUSD;
  // bullionFXDayData.totalLiquidityBNB = bullionfx.totalLiquidityBNB;
  bullionFXDayData.totalTransactions = bullionfx.totalTransactions;
  bullionFXDayData.save();

  return bullionFXDayData as BullionFXDayData;
}

export function updatePairDayData(event: ethereum.Event): PairDayData | null {
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let dayPairID = event.address.toHex().concat("-").concat(BigInt.fromI32(dayID).toString());
  let pair = Pair.load(event.address.toHex());
  if (pair === null) {
    log.error(`updatePairDayData: pair {} not found`, [event.address.toHex()]);
    return null;
  }
  let pairDayData = PairDayData.load(dayPairID);
  if (pairDayData === null) {
    pairDayData = new PairDayData(dayPairID);
    pairDayData.date = dayStartTimestamp;
    pairDayData.token0 = pair.token0;
    pairDayData.token1 = pair.token1;
    pairDayData.pairAddress = event.address;
    pairDayData.dailyVolumeToken0 = ZERO_BD;
    pairDayData.dailyVolumeToken1 = ZERO_BD;
    pairDayData.dailyVolumeUSD = ZERO_BD;
    pairDayData.dailyTxns = ZERO_BI;
  }
  pairDayData.totalSupply = pair.totalSupply;
  pairDayData.reserve0 = pair.reserve0;
  pairDayData.reserve1 = pair.reserve1;
  pairDayData.reserveUSD = pair.reserveUSD;
  pairDayData.dailyTxns = pairDayData.dailyTxns.plus(ONE_BI);
  pairDayData.save();

  return pairDayData as PairDayData;
}

export function updatePairHourData(event: ethereum.Event): PairHourData | null {
  let timestamp = event.block.timestamp.toI32();
  let hourIndex = timestamp / 3600;
  let hourStartUnix = hourIndex * 3600;
  let hourPairID = event.address.toHex().concat("-").concat(BigInt.fromI32(hourIndex).toString());
  let pair = Pair.load(event.address.toHex());
  if (pair === null) {
    log.error(`updatePairHourData: pair {} not found`, [event.address.toHex()]);
    return null;
  }
  let pairHourData = PairHourData.load(hourPairID);
  if (pairHourData === null) {
    pairHourData = new PairHourData(hourPairID);
    pairHourData.hourStartUnix = hourStartUnix;
    pairHourData.pair = event.address.toHex();
    pairHourData.hourlyVolumeToken0 = ZERO_BD;
    pairHourData.hourlyVolumeToken1 = ZERO_BD;
    pairHourData.hourlyVolumeUSD = ZERO_BD;
    pairHourData.hourlyTxns = ZERO_BI;
  }
  pairHourData.totalSupply = pair.totalSupply;
  pairHourData.reserve0 = pair.reserve0;
  pairHourData.reserve1 = pair.reserve1;
  pairHourData.reserveUSD = pair.reserveUSD;
  pairHourData.hourlyTxns = pairHourData.hourlyTxns.plus(ONE_BI);
  pairHourData.save();

  return pairHourData as PairHourData;
}

export function updateTokenDayData(token: Token, event: ethereum.Event): TokenDayData {
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let tokenDayID = token.id.toString().concat("-").concat(BigInt.fromI32(dayID).toString());

  let tokenDayData = TokenDayData.load(tokenDayID);
  if (tokenDayData === null) {
    tokenDayData = new TokenDayData(tokenDayID);
    tokenDayData.date = dayStartTimestamp;
    tokenDayData.token = token.id;
    tokenDayData.priceUSD = token.derivedUSD;
    tokenDayData.dailyVolumeToken = ZERO_BD;
    // tokenDayData.dailyVolumeBNB = ZERO_BD;
    tokenDayData.dailyVolumeUSD = ZERO_BD;
    tokenDayData.dailyTxns = ZERO_BI;
    tokenDayData.totalLiquidityUSD = ZERO_BD;
  }
  tokenDayData.priceUSD = token.derivedUSD;
  tokenDayData.totalLiquidityToken = token.totalLiquidity;
  // tokenDayData.totalLiquidityBNB = token.totalLiquidity.times(token.derivedBNB as BigDecimal);
  tokenDayData.dailyTxns = tokenDayData.dailyTxns.plus(ONE_BI);
  tokenDayData.save();

  return tokenDayData as TokenDayData;
}
