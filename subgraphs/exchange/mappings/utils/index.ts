/* eslint-disable prefer-const */
import { BigInt, BigDecimal, Address, log } from "@graphprotocol/graph-ts";
import { ERC20 } from "../../generated/BullionFXFactory/ERC20";
// import { ERC20NameBytes } from "../../generated/BullionFXFactory/ERC20NameBytes";
// import { ERC20SymbolBytes } from "../../generated/BullionFXFactory/ERC20SymbolBytes";
import { Factory as FactoryContract } from "../../generated/templates/Pair/Factory";

export let ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export let BULLIONFX_FACTORY_ADDRESS = "0x5E7CfE3DB397d3DF3F516d79a072F4C2ae5f39bb";
export let SUSHI_FACTORY_ADDRESS = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ZERO_BD = BigDecimal.fromString("0");
export let ONE_BD = BigDecimal.fromString("1");
export let BI_18 = BigInt.fromI32(18);

export let bullionFXFactoryContract = FactoryContract.bind(Address.fromString(BULLIONFX_FACTORY_ADDRESS));
export let sushiFactoryContract = FactoryContract.bind(Address.fromString(SUSHI_FACTORY_ADDRESS));

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString("1");
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString("10"));
  }
  return bd;
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal();
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals));
}

export function isNullEthValue(value: string): boolean {
  return value == "0x0000000000000000000000000000000000000000000000000000000000000001";
}

export function fetchTokenSymbol(tokenAddress: Address): string {
  let contract = ERC20.bind(tokenAddress);
  // let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress);

  let symbolValue = "unknown";
  let symbolResult = contract.try_symbol();
  if (symbolResult.reverted) {
  //   let symbolResultBytes = contractSymbolBytes.try_symbol();
  //   if (!symbolResultBytes.reverted) {
  //     if (!isNullEthValue(symbolResultBytes.value.toHex())) {
  //       symbolValue = symbolResultBytes.value.toString();
  //     }
  //   }
  } else {
    symbolValue = symbolResult.value;
  }
  return symbolValue;
}

export function fetchTokenName(tokenAddress: Address): string {
  let contract = ERC20.bind(tokenAddress);
  // let contractNameBytes = ERC20NameBytes.bind(tokenAddress);

  let nameValue = "unknown";
  let nameResult = contract.try_name();
  if (nameResult.reverted) {
  //   let nameResultBytes = contractNameBytes.try_name();
  //   log.error(`block:, fetch token name reverted`, []);
  //   if (!nameResultBytes.reverted) {
  //     if (!isNullEthValue(nameResultBytes.value.toHex())) {
  //       nameValue = nameResultBytes.value.toString() || "undefined";
  //     }
  //   }
  } else {
    nameValue = nameResult.value;
  }
  return nameValue;
}

export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  let contract = ERC20.bind(tokenAddress);
  let decimalValue = 0;
  let decimalResult = contract.try_decimals();
  if (!decimalResult.reverted) {
    decimalValue = decimalResult.value;
  }
  return BigInt.fromI32(decimalValue as i32);
}
