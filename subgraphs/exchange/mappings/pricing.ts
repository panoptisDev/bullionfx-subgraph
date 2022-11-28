/* eslint-disable prefer-const */
import { BigDecimal, Address, log } from "@graphprotocol/graph-ts/index";
import { Pair, Token } from "../generated/schema";
import { ZERO_BD, sushiFactoryContract, bullionFXFactoryContract, ADDRESS_ZERO, ONE_BD } from "./utils";

// let WETH_ADDRESS = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6";
let USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
let USDC_WETH_PAIR = "0x397ff1542f962076d0bfe58ea045ffa2d347aca0";

export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdcPair = Pair.load(USDC_WETH_PAIR); // busd is token1

  if (usdcPair !== null) {
    return usdcPair.token1Price;
  } else {
    return ZERO_BD;
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2", // SUSHI
];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_USD = BigDecimal.fromString("10");

/**
 * Search through graph to find derived USDC per token.
 * @todo update to be derived USDC (add stablecoin estimates)
 **/
export function findUsdPerToken(token: Token, isBullionFX: boolean): BigDecimal {
  if (token.id == USDC_ADDRESS) {
    return ONE_BD;
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = isBullionFX ?
      bullionFXFactoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i])) :
      sushiFactoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]));
    if (pairAddress.toHex() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHex());
      if (pair === null) {
        log.error(`findUsdPerToken: pair {} not found`, [pairAddress.toHex()]);
        return ZERO_BD;
      }
      if (pair.token0 == token.id && pair.reserveUSD.gt(MINIMUM_LIQUIDITY_THRESHOLD_USD)) {
        let token1 = Token.load(pair.token1);
        if (token1 === null) {
          log.error(`findUsdPerToken: token1 {} not found`, [pair.token1]);
          return ZERO_BD;
        }
        return pair.token1Price.times(token1.derivedUSD as BigDecimal); // return token1 per our token * BNB per token 1
      }
      if (pair.token1 == token.id && pair.reserveUSD.gt(MINIMUM_LIQUIDITY_THRESHOLD_USD)) {
        let token0 = Token.load(pair.token0);
        if (token0 === null) {
          log.error(`findUsdPerToken: token0 {} not found`, [pair.token0]);
          return ZERO_BD;
        }
        return pair.token0Price.times(token0.derivedUSD as BigDecimal); // return token0 per our token * BNB per token 0
      }
    }
  }
  return ZERO_BD; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedUSD;
  let price1 = token1.derivedUSD;

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString("2"));
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1);
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedUSD;
  let price1 = token1.derivedUSD;

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString("2"));
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString("2"));
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}
