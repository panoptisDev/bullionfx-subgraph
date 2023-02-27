/* eslint-disable prefer-const */
import { BigInt, BigDecimal, store, log } from "@graphprotocol/graph-ts";
import {
  Pair,
  Token,
  BullionFXFactory,
  Transaction,
  Mint as MintEvent,
  Burn as BurnEvent,
  Swap as SwapEvent,
  // Bundle,
} from "../generated/schema";
import { Mint, Burn, Swap, Transfer, Sync } from "../generated/templates/Pair/Pair";
import { updatePairDayData, updateTokenDayData, updateBullionFXDayData, updatePairHourData } from "./dayUpdates";
import { findUsdPerToken, getTrackedVolumeUSD, getTrackedLiquidityUSD } from "./pricing";
import { convertTokenToDecimal, ADDRESS_ZERO, BULLIONFX_FACTORY_ADDRESS, ONE_BI, ZERO_BD, BI_18 } from "./utils";

const START_BLOCK_FOR_SUSHI_TOKEN_SWAPS = 10977288;

function isCompleteMint(mintId: string): boolean {
  let mint = MintEvent.load(mintId);
  if (mint === null) {
    log.error(`isCompleteMint: mint {} not found`, [mintId]);
    return false;
  }
  return mint.sender !== null; // sufficient checks
}

export function handleTransfer(event: Transfer): void {
  // Initial liquidity.
  if (event.params.to.toHex() == ADDRESS_ZERO && event.params.value.equals(BigInt.fromI32(1000))) {
    return;
  }

  // get pair and load contract
  let pair = Pair.load(event.address.toHex());
  if (pair === null) {
    log.error(`handleTransfer: pair {} not found`, [event.address.toHex()]);
    return;
  }

  // liquidity token amount being transferred
  let value = convertTokenToDecimal(event.params.value, BI_18);

  // get or create transaction
  let transaction = Transaction.load(event.transaction.hash.toHex());
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHex());
    transaction.block = event.block.number;
    transaction.timestamp = event.block.timestamp;
    transaction.mints = [];
    transaction.burns = [];
    transaction.swaps = [];
  }

  // mints
  let mints = transaction.mints;
  if (event.params.from.toHex() == ADDRESS_ZERO) {
    // update total supply
    pair.totalSupply = pair.totalSupply.plus(value);
    pair.save();

    // create new mint if no mints so far or if last one is done already
    if (mints.length === 0 || isCompleteMint(mints[mints.length - 1])) {
      let mint = new MintEvent(
        event.transaction.hash.toHex().concat("-").concat(BigInt.fromI32(mints.length).toString())
      );
      mint.transaction = transaction.id;
      mint.pair = pair.id;
      mint.to = event.params.to;
      mint.liquidity = value;
      mint.timestamp = transaction.timestamp;
      mint.transaction = transaction.id;
      mint.save();

      // update mints in transaction
      transaction.mints = mints.concat([mint.id]);

      // save entities

      if (pair.isBullionFX === true) {
        transaction.save();
      }
    }
  }

  // case where direct send first on BNB withdrawals
  if (event.params.to.toHex() == pair.id) {
    let burns = transaction.burns;
    let burn = new BurnEvent(
      event.transaction.hash.toHex().concat("-").concat(BigInt.fromI32(burns.length).toString())
    );
    burn.transaction = transaction.id;
    burn.pair = pair.id;
    burn.liquidity = value;
    burn.timestamp = transaction.timestamp;
    burn.to = event.params.to;
    burn.sender = event.params.from;
    burn.needsComplete = true;
    burn.transaction = transaction.id;
    
    // TODO: Consider using .concat() for handling array updates to protect
    // against unintended side effects for other code paths.
    burns.push(burn.id);
    transaction.burns = burns;
    
    if (pair.isBullionFX === true) {
      burn.save();
      transaction.save();
    }
  }

  // burn
  if (event.params.to.toHex() == ADDRESS_ZERO && event.params.from.toHex() == pair.id) {
    pair.totalSupply = pair.totalSupply.minus(value);
    pair.save();

    // this is a new instance of a logical burn
    let burns = transaction.burns;
    let burn: BurnEvent;
    if (burns.length > 0) {
      let currentBurn = BurnEvent.load(burns[burns.length - 1]);
      if (currentBurn === null) {
        log.error(`handleTransfer: burn event not found`, []);
        return;
      }
      if (currentBurn.needsComplete) {
        burn = currentBurn as BurnEvent;
      } else {
        burn = new BurnEvent(
          event.transaction.hash.toHex().concat("-").concat(BigInt.fromI32(burns.length).toString())
        );
        burn.transaction = transaction.id;
        burn.needsComplete = false;
        burn.pair = pair.id;
        burn.liquidity = value;
        burn.transaction = transaction.id;
        burn.timestamp = transaction.timestamp;
      }
    } else {
      burn = new BurnEvent(event.transaction.hash.toHex().concat("-").concat(BigInt.fromI32(burns.length).toString()));
      burn.transaction = transaction.id;
      burn.needsComplete = false;
      burn.pair = pair.id;
      burn.liquidity = value;
      burn.transaction = transaction.id;
      burn.timestamp = transaction.timestamp;
    }

    // if this logical burn included a fee mint, account for this
    if (mints.length !== 0 && !isCompleteMint(mints[mints.length - 1])) {
      let mint = MintEvent.load(mints[mints.length - 1]);
      if (mint === null) {
        log.error(`handleTransfer: mint event not found`, []);
        return;
      }
      burn.feeTo = mint.to;
      burn.feeLiquidity = mint.liquidity;
      // remove the logical mint
      store.remove("Mint", mints[mints.length - 1]);
      // update the transaction

      // TODO: Consider using .slice().pop() to protect against unintended
      // side effects for other code paths.
      mints.pop();
      transaction.mints = mints;

      if (pair.isBullionFX === true) {
        transaction.save();
      }
    }
    if (pair.isBullionFX === true) {
      burn.save();
    }
    // if accessing last one, replace it
    if (burn.needsComplete) {
      // TODO: Consider using .slice(0, -1).concat() to protect against
      // unintended side effects for other code paths.
      burns[burns.length - 1] = burn.id;
    }
    // else add new one
    else {
      // TODO: Consider using .concat() for handling array updates to protect
      // against unintended side effects for other code paths.
      burns.push(burn.id);
    }
    transaction.burns = burns;

    if (pair.isBullionFX === true) {
      transaction.save();
    }
  }


  if (pair.isBullionFX === true) {
    transaction.save();
  }
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHex());
  if (pair === null) {
    log.error(`handleSync: pair {} not found`, [event.address.toHex()]);
    return;
  }
  let token0 = Token.load(pair.token0);
  if (token0 === null) {
    log.error(`handleSync: token0 {} not found`, [pair.token0]);
    return;
  }
  let token1 = Token.load(pair.token1);
  if (token1 === null) {
    log.error(`handleSync: token1 {} not found`, [pair.token1]);
    return;
  }
  let bullionfx = BullionFXFactory.load(BULLIONFX_FACTORY_ADDRESS);
  if (bullionfx === null) {
    log.error(`handleSync: bullionfx {} not found`, [BULLIONFX_FACTORY_ADDRESS]);
    return;
  }

  if (pair.isBullionFX === true) {
    // reset factory liquidity by subtracting only tracked liquidity
    bullionfx.totalLiquidityUSD = bullionfx.totalLiquidityUSD.minus(pair.trackedReserveUSD as BigDecimal);
  }

  // reset token total liquidity amounts
  token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0);
  token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1);

  pair.reserve0 = convertTokenToDecimal(event.params.reserve0, token0.decimals);
  pair.reserve1 = convertTokenToDecimal(event.params.reserve1, token1.decimals);

  if (pair.reserve1.notEqual(ZERO_BD)) pair.token0Price = pair.reserve0.div(pair.reserve1);
  else pair.token0Price = ZERO_BD;
  if (pair.reserve0.notEqual(ZERO_BD)) pair.token1Price = pair.reserve1.div(pair.reserve0);
  else pair.token1Price = ZERO_BD;

  // let bundle = Bundle.load("1");
  // bundle.bnbPrice = getBnbPriceInUSD();
  // bundle.save();

  let t0DerivedUSD = findUsdPerToken(token0 as Token, pair.isBullionFX);
  token0.derivedUSD = t0DerivedUSD;
  token0.save();

  let t1DerivedUSD = findUsdPerToken(token1 as Token, pair.isBullionFX);
  token1.derivedUSD = t1DerivedUSD;
  token1.save();

  // get tracked liquidity - will be 0 if neither is in whitelist
  let trackedLiquidityUSD: BigDecimal;
  trackedLiquidityUSD = getTrackedLiquidityUSD(
    pair.reserve0,
    token0 as Token,
    pair.reserve1,
    token1 as Token
  );

  // use derived amounts within pair
  pair.trackedReserveUSD = trackedLiquidityUSD;
  pair.reserveUSD = pair.reserve0
    .times(token0.derivedUSD as BigDecimal)
    .plus(pair.reserve1.times(token1.derivedUSD as BigDecimal));

  if (pair.isBullionFX === true) {
    // use tracked amounts globally
    // pancake.totalLiquidityBNB = pancake.totalLiquidityBNB.plus(trackedLiquidityBNB);
    bullionfx.totalLiquidityUSD = bullionfx.totalLiquidityUSD.plus(trackedLiquidityUSD);
    bullionfx.save();
  }

  // now correctly set liquidity amounts for each token
  token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0);
  token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1);

  // save entities
  pair.save();
  token0.save();
  token1.save();
}

export function handleMint(event: Mint): void {
  let transaction = Transaction.load(event.transaction.hash.toHex());
  if (transaction === null) {
    log.error(`handleMint: transaction {} not found`, [event.transaction.hash.toHex()]);
    return;
  }
  let mints = transaction.mints;
  let mint = MintEvent.load(mints[mints.length - 1]);
  if (mint === null) {
    log.error(`handleMint: mint event not found`, []);
    return;
  }

  let pair = Pair.load(event.address.toHex());
  if (pair === null) {
    log.error(`handleMint: pair {} not found`, [event.address.toHex()]);
    return;
  }
  let bullionfx = BullionFXFactory.load(BULLIONFX_FACTORY_ADDRESS);
  if (bullionfx === null) {
    log.error(`handleMint: bullionfx {} not found`, [BULLIONFX_FACTORY_ADDRESS]);
    return;
  }

  let token0 = Token.load(pair.token0);
  if (token0 === null) {
    log.error(`handleMint: token0 {} not found`, [pair.token0]);
    return;
  }
  let token1 = Token.load(pair.token1);
  if (token1 === null) {
    log.error(`handleMint: token1 {} not found`, [pair.token1]);
    return;
  }

  // update exchange info (except balances, sync will cover that)
  let token0Amount = convertTokenToDecimal(event.params.amount0, token0.decimals);
  let token1Amount = convertTokenToDecimal(event.params.amount1, token1.decimals);

  // update txn counts
  token0.totalTransactions = token0.totalTransactions.plus(ONE_BI);
  token1.totalTransactions = token1.totalTransactions.plus(ONE_BI);

  // get new amounts of USD and BNB for tracking
  // let bundle = Bundle.load("1");
  let amountTotalUSD = token1.derivedUSD
    .times(token1Amount)
    .plus(token0.derivedUSD.times(token0Amount));

  // update txn counts
  pair.totalTransactions = pair.totalTransactions.plus(ONE_BI);
  if (pair.isBullionFX === true) {
    bullionfx.totalTransactions = bullionfx.totalTransactions.plus(ONE_BI);
    bullionfx.save();
    updateBullionFXDayData(event);
  }

  // save entities
  token0.save();
  token1.save();
  pair.save();

  mint.sender = event.params.sender;
  mint.amount0 = token0Amount as BigDecimal;
  mint.amount1 = token1Amount as BigDecimal;
  mint.logIndex = event.logIndex;
  mint.amountUSD = amountTotalUSD as BigDecimal;
  if (pair.isBullionFX === true) {
    mint.save();
  }

  updatePairDayData(event);
  updatePairHourData(event);
  updateTokenDayData(token0 as Token, event);
  updateTokenDayData(token1 as Token, event);
}

export function handleBurn(event: Burn): void {
  let transaction = Transaction.load(event.transaction.hash.toHex());
  if (transaction === null) {
    return;
  }

  let burns = transaction.burns;
  let burn = BurnEvent.load(burns[burns.length - 1]);
  if (burn === null) {
    log.error(`handleBurn: burn event not found`, []);
    return;
  }

  let pair = Pair.load(event.address.toHex());
  if (pair === null) {
    log.error(`handleBurn: pair {} not found`, [event.address.toHex()]);
    return;
  }
  let bullionfx = BullionFXFactory.load(BULLIONFX_FACTORY_ADDRESS);
  if (bullionfx === null) {
    log.error(`handleBurn: bullionfx {} not found`, [BULLIONFX_FACTORY_ADDRESS]);
    return;
  }

  //update token info
  let token0 = Token.load(pair.token0);
  let token1 = Token.load(pair.token1);
  if (token0 === null) {
    log.error(`handleBurn: token0 {} not found`, [pair.token0]);
    return;
  }
  if (token1 === null) {
    log.error(`handleBurn: token1 {} not found`, [pair.token1]);
    return;
  }
  let token0Amount = convertTokenToDecimal(event.params.amount0, token0.decimals);
  let token1Amount = convertTokenToDecimal(event.params.amount1, token1.decimals);

  // update txn counts
  token0.totalTransactions = token0.totalTransactions.plus(ONE_BI);
  token1.totalTransactions = token1.totalTransactions.plus(ONE_BI);

  // get new amounts of USD and BNB for tracking
  // let bundle = Bundle.load("1");
  let amountTotalUSD = token1.derivedUSD
    .times(token1Amount)
    .plus(token0.derivedUSD.times(token0Amount));

  // update txn counts
  if (pair.isBullionFX === true) {
    bullionfx.totalTransactions = bullionfx.totalTransactions.plus(ONE_BI);
    bullionfx.save();
    updateBullionFXDayData(event);
  }
  pair.totalTransactions = pair.totalTransactions.plus(ONE_BI);

  // update global counter and save
  token0.save();
  token1.save();
  pair.save();

  // update burn
  // burn.sender = event.params.sender
  burn.amount0 = token0Amount as BigDecimal;
  burn.amount1 = token1Amount as BigDecimal;
  // burn.to = event.params.to
  burn.logIndex = event.logIndex;
  burn.amountUSD = amountTotalUSD as BigDecimal;
  if (pair.isBullionFX === true) {
    burn.save();
  }

  updatePairDayData(event);
  updatePairHourData(event);
  updateTokenDayData(token0 as Token, event);
  updateTokenDayData(token1 as Token, event);
}

export function handleSwap(event: Swap): void {
  let pair = Pair.load(event.address.toHex());
  if (pair === null) {
    log.error(`handleSwap: pair {} not found`, [event.address.toHex()]);
    return;
  }
  let token0 = Token.load(pair.token0);
  if (token0 === null) {
    log.error(`handleSwap: token0 {} not found`, [pair.token0.toString()]);
    return;
  }
  let token1 = Token.load(pair.token1);
  if (token1 === null) {
    log.error(`handleSwap: token1 {} not found`, [pair.token1.toString()]);
    return;
  }
  let amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals);
  let amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals);
  let amount0Out = convertTokenToDecimal(event.params.amount0Out, token0.decimals);
  let amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals);

  // totals for volume updates
  let amount0Total = amount0Out.plus(amount0In);
  let amount1Total = amount1Out.plus(amount1In);

  // BNB/USD prices
  // let bundle = Bundle.load("1");

  // get total amounts of derived USD and BNB for tracking
  let derivedAmountUSD = token1.derivedUSD
    .times(amount1Total)
    .plus(token0.derivedUSD.times(amount0Total))
    .div(BigDecimal.fromString("2"));
  // let derivedAmountUSD = derivedAmountBNB.times(bundle.bnbPrice);

  // only accounts for volume through white listed tokens
  let trackedAmountUSD = getTrackedVolumeUSD(
    // bundle as Bundle,
    amount0Total,
    token0 as Token,
    amount1Total,
    token1 as Token
  );

  // let trackedAmountBNB: BigDecimal;
  // if (bundle.bnbPrice.equals(ZERO_BD)) {
  //   trackedAmountBNB = ZERO_BD;
  // } else {
  //   trackedAmountBNB = trackedAmountUSD.div(bundle.bnbPrice);
  // }

  // update token0 global volume and token liquidity stats
  token0.tradeVolume = token0.tradeVolume.plus(amount0In.plus(amount0Out));
  token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD);
  token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD);

  // update token1 global volume and token liquidity stats
  token1.tradeVolume = token1.tradeVolume.plus(amount1In.plus(amount1Out));
  token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD);
  token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD);

  // update txn counts
  token0.totalTransactions = token0.totalTransactions.plus(ONE_BI);
  token1.totalTransactions = token1.totalTransactions.plus(ONE_BI);

  // update pair volume data, use tracked amount if we have it as its probably more accurate
  pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD);
  pair.volumeToken0 = pair.volumeToken0.plus(amount0Total);
  pair.volumeToken1 = pair.volumeToken1.plus(amount1Total);
  pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD);
  pair.totalTransactions = pair.totalTransactions.plus(ONE_BI);
  pair.save();

  if (pair.isBullionFX === true) {
    // update global values, only used tracked amounts for volume
    let bullionfx = BullionFXFactory.load(BULLIONFX_FACTORY_ADDRESS);
    if (bullionfx === null) {
      log.error(`handleSwap: bullionfx {} not found`, [BULLIONFX_FACTORY_ADDRESS]);
      return;
    }
    bullionfx.totalVolumeUSD = bullionfx.totalVolumeUSD.plus(trackedAmountUSD);
    // bullionfx.totalVolumeBNB = bullionfx.totalVolumeBNB.plus(trackedAmountBNB);
    bullionfx.untrackedVolumeUSD = bullionfx.untrackedVolumeUSD.plus(derivedAmountUSD);
    bullionfx.totalTransactions = bullionfx.totalTransactions.plus(ONE_BI);
    bullionfx.save();
  }

  // save entities
  pair.save();
  token0.save();
  token1.save();

  let transaction = Transaction.load(event.transaction.hash.toHex());
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHex());
    transaction.block = event.block.number;
    transaction.timestamp = event.block.timestamp;
    transaction.mints = [];
    transaction.swaps = [];
    transaction.burns = [];
  }
  let swaps = transaction.swaps;
  let swap = new SwapEvent(event.transaction.hash.toHex().concat("-").concat(BigInt.fromI32(swaps.length).toString()));

  // update swap event
  swap.transaction = transaction.id;
  swap.pair = pair.id;
  swap.timestamp = transaction.timestamp;
  swap.transaction = transaction.id;
  swap.sender = event.params.sender;
  swap.amount0In = amount0In;
  swap.amount1In = amount1In;
  swap.amount0Out = amount0Out;
  swap.amount1Out = amount1Out;
  swap.to = event.params.to;
  swap.from = event.transaction.from;
  swap.logIndex = event.logIndex;
  // use the tracked amount if we have it
  swap.amountUSD = trackedAmountUSD === ZERO_BD ? derivedAmountUSD : trackedAmountUSD;
  if (event.block.number.gt(new BigInt(START_BLOCK_FOR_SUSHI_TOKEN_SWAPS))) {
    swap.save();
  }

  // update the transaction

  // TODO: Consider using .concat() for handling array updates to protect
  // against unintended side effects for other code paths.
  swaps.push(swap.id);
  transaction.swaps = swaps;

  if (pair.isBullionFX === true) {
    transaction.save();
  }

  // update day entities
  let pairDayData = updatePairDayData(event);
  let pairHourData = updatePairHourData(event);
  let token0DayData = updateTokenDayData(token0 as Token, event);
  let token1DayData = updateTokenDayData(token1 as Token, event);

  if (pair.isBullionFX === true) {
    let bullionFXDayData = updateBullionFXDayData(event);
    // swap specific updating
    if (bullionFXDayData !== null) {
      bullionFXDayData.dailyVolumeUSD = bullionFXDayData.dailyVolumeUSD.plus(trackedAmountUSD);
      // bullionFXDayData.dailyVolumeBNB = bullionFXDayData.dailyVolumeBNB.plus(trackedAmountBNB);
      bullionFXDayData.dailyVolumeUntracked = bullionFXDayData.dailyVolumeUntracked.plus(derivedAmountUSD);
      bullionFXDayData.save();
    }
  }

  // swap specific updating for pair
  if (pairDayData !== null) {
    pairDayData.dailyVolumeToken0 = pairDayData.dailyVolumeToken0.plus(amount0Total);
    pairDayData.dailyVolumeToken1 = pairDayData.dailyVolumeToken1.plus(amount1Total);
    pairDayData.dailyVolumeUSD = pairDayData.dailyVolumeUSD.plus(trackedAmountUSD);
    pairDayData.save();
  }

  // update hourly pair data
  if (pairHourData !== null) {
    pairHourData.hourlyVolumeToken0 = pairHourData.hourlyVolumeToken0.plus(amount0Total);
    pairHourData.hourlyVolumeToken1 = pairHourData.hourlyVolumeToken1.plus(amount1Total);
    pairHourData.hourlyVolumeUSD = pairHourData.hourlyVolumeUSD.plus(trackedAmountUSD);
    pairHourData.save();
  }

  // swap specific updating for token0
  token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total);
  // token0DayData.dailyVolumeBNB = token0DayData.dailyVolumeBNB.plus(amount0Total.times(token0.derivedBNB as BigDecimal));
  token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(
    amount0Total.times(token0.derivedUSD as BigDecimal)
  );
  token0DayData.save();

  // swap specific updating
  token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total);
  // token1DayData.dailyVolumeBNB = token1DayData.dailyVolumeBNB.plus(amount1Total.times(token1.derivedBNB as BigDecimal));
  token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(
    amount1Total.times(token1.derivedUSD as BigDecimal)
  );
  token1DayData.save();
}
