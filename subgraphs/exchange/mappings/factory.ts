/* eslint-disable prefer-const */
import { BullionFXFactory, Pair, Token } from "../generated/schema";
import { Pair as PairTemplate } from "../generated/templates";
import { PairCreated } from "../generated/BullionFXFactory/Factory";
import {
  BULLIONFX_FACTORY_ADDRESS,
  ZERO_BD,
  ZERO_BI,
  ONE_BI,
  fetchTokenSymbol,
  fetchTokenName,
  fetchTokenDecimals,
} from "./utils";
import { log } from "@graphprotocol/graph-ts";

export function handlePairCreated(event: PairCreated): void {
  // let factory = BullionFXFactory.load(FACTORY_ADDRESS);
  // if (factory === null) {
  //   factory = new BullionFXFactory(FACTORY_ADDRESS);
  //   factory.totalPairs = ZERO_BI;
  //   factory.totalTransactions = ZERO_BI;
  //   factory.totalVolumeUSD = ZERO_BD;
  //   factory.untrackedVolumeUSD = ZERO_BD;
  //   factory.totalLiquidityUSD = ZERO_BD;
  // }
  // factory.totalPairs = factory.totalPairs.plus(ONE_BI);
  // factory.save();

  let token0 = Token.load(event.params.token0.toHex());
  if (token0 === null) {
    token0 = new Token(event.params.token0.toHex());
    token0.name = fetchTokenName(event.params.token0);
    token0.symbol = fetchTokenSymbol(event.params.token0);
    let decimals = fetchTokenDecimals(event.params.token0);
    // log.error(`token0 block: {}, tokenAddress: {}, name: {}`, [event.block.number.toString(), event.params.token0.toHex(), token0.name]);
    token0.decimals = decimals;
    token0.derivedUSD = ZERO_BD;
    token0.tradeVolume = ZERO_BD;
    token0.tradeVolumeUSD = ZERO_BD;
    token0.untrackedVolumeUSD = ZERO_BD;
    token0.totalLiquidity = ZERO_BD;
    token0.totalTransactions = ZERO_BI;
    token0.save();
  }

  let token1 = Token.load(event.params.token1.toHex());
  if (token1 === null) {
    token1 = new Token(event.params.token1.toHex());
    token1.name = fetchTokenName(event.params.token1);
    token1.symbol = fetchTokenSymbol(event.params.token1);
    let decimals = fetchTokenDecimals(event.params.token1);
    // log.error(`block: {}, tokenAddress: {}, name: {}`, [event.block.number.toString(), event.params.token1.toHex(), token1.name]);
    token1.decimals = decimals;
    token1.derivedUSD = ZERO_BD;
    token1.tradeVolume = ZERO_BD;
    token1.tradeVolumeUSD = ZERO_BD;
    token1.untrackedVolumeUSD = ZERO_BD;
    token1.totalLiquidity = ZERO_BD;
    token1.totalTransactions = ZERO_BI;
    token1.save();
  }

  let pair = new Pair(event.params.pair.toHex()) as Pair;
  pair.token0 = token0.id;
  pair.token1 = token1.id;
  pair.name = token0.symbol.concat("-").concat(token1.symbol);
  pair.totalTransactions = ZERO_BI;
  pair.reserve0 = ZERO_BD;
  pair.reserve1 = ZERO_BD;
  pair.trackedReserveUSD = ZERO_BD;
  pair.reserveUSD = ZERO_BD;
  pair.totalSupply = ZERO_BD;
  pair.volumeToken0 = ZERO_BD;
  pair.volumeToken1 = ZERO_BD;
  pair.volumeUSD = ZERO_BD;
  pair.untrackedVolumeUSD = ZERO_BD;
  pair.token0Price = ZERO_BD;
  pair.token1Price = ZERO_BD;
  pair.block = event.block.number;
  pair.timestamp = event.block.timestamp;
  pair.isBullionFX = false;
  pair.save();

  PairTemplate.create(event.params.pair);
}

export function handleBullionFXPairCreated(event: PairCreated): void {
  let factory = BullionFXFactory.load(BULLIONFX_FACTORY_ADDRESS);
  if (factory === null) {
    factory = new BullionFXFactory(BULLIONFX_FACTORY_ADDRESS);
    factory.totalPairs = ZERO_BI;
    factory.totalTransactions = ZERO_BI;
    factory.totalVolumeUSD = ZERO_BD;
    factory.untrackedVolumeUSD = ZERO_BD;
    factory.totalLiquidityUSD = ZERO_BD;
  }
  factory.totalPairs = factory.totalPairs.plus(ONE_BI);
  factory.save();

  let token0 = Token.load(event.params.token0.toHex());
  if (token0 === null) {
    token0 = new Token(event.params.token0.toHex());
    token0.name = fetchTokenName(event.params.token0);
    token0.symbol = fetchTokenSymbol(event.params.token0);
    let decimals = fetchTokenDecimals(event.params.token0);
    if (decimals === null) {
      return;
    }
    token0.decimals = decimals;
    token0.derivedUSD = ZERO_BD;
    token0.tradeVolume = ZERO_BD;
    token0.tradeVolumeUSD = ZERO_BD;
    token0.untrackedVolumeUSD = ZERO_BD;
    token0.totalLiquidity = ZERO_BD;
    token0.totalTransactions = ZERO_BI;
    token0.save();
  }

  let token1 = Token.load(event.params.token1.toHex());
  if (token1 === null) {
    token1 = new Token(event.params.token1.toHex());
    token1.name = fetchTokenName(event.params.token1);
    token1.symbol = fetchTokenSymbol(event.params.token1);
    let decimals = fetchTokenDecimals(event.params.token1);
    if (decimals === null) {
      return;
    }
    token1.decimals = decimals;
    token1.derivedUSD = ZERO_BD;
    token1.tradeVolume = ZERO_BD;
    token1.tradeVolumeUSD = ZERO_BD;
    token1.untrackedVolumeUSD = ZERO_BD;
    token1.totalLiquidity = ZERO_BD;
    token1.totalTransactions = ZERO_BI;
    token1.save();
  }

  let pair = new Pair(event.params.pair.toHex()) as Pair;
  pair.token0 = token0.id;
  pair.token1 = token1.id;
  pair.name = token0.symbol.concat("-").concat(token1.symbol);
  pair.totalTransactions = ZERO_BI;
  pair.reserve0 = ZERO_BD;
  pair.reserve1 = ZERO_BD;
  pair.trackedReserveUSD = ZERO_BD;
  pair.reserveUSD = ZERO_BD;
  pair.totalSupply = ZERO_BD;
  pair.volumeToken0 = ZERO_BD;
  pair.volumeToken1 = ZERO_BD;
  pair.volumeUSD = ZERO_BD;
  pair.untrackedVolumeUSD = ZERO_BD;
  pair.token0Price = ZERO_BD;
  pair.token1Price = ZERO_BD;
  pair.block = event.block.number;
  pair.timestamp = event.block.timestamp;
  pair.isBullionFX = true;
  pair.save();

  PairTemplate.create(event.params.pair);
}
