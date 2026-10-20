"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { formatUnits, parseUnits } from "ethers";
import {
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { erc20Abi, type Address } from "viem";
import {
  MAINNET_TOKENS,
  BASE_TOKENS,
  AFFILIATE_FEE,
  FEE_RECIPIENT,
} from "../../src/constants";
import qs from "qs";

const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const isNative = (address: string) => address.toLowerCase() === NATIVE_ETH;

export const DEFAULT_BUY_TOKEN = (_chainId: number) => "weth";

type Token = (typeof MAINNET_TOKENS)[number];
type SwapPrice = {
  buyAmount?: string;
  fees?: { integratorFee?: { amount?: string } };
  issues?: { allowance?: { spender?: Address; actual?: string } | null };
  tokenMetadata?: {
    buyToken?: { buyTaxBps?: string; sellTaxBps?: string };
    sellToken?: { buyTaxBps?: string; sellTaxBps?: string };
  };
  validationErrors?: Array<{ reason?: string; field?: string }>;
  message?: string;
};

function useTokenBalance(address: Address | undefined, token: Token | undefined, chainId: number) {
  const native = token ? isNative(token.address) : false;
  const nativeBalance = useBalance({
    address,
    chainId,
    query: { enabled: !!address && !!token && native },
  });
  const erc20Balance = useReadContract({
    chainId,
    address: (token?.address ?? NATIVE_ETH) as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!token && !native },
  });
  return native ? nativeBalance.data?.value : erc20Balance.data;
}

export default function PriceView({
  price,
  taker,
  setPrice,
  setFinalize,
  chainId,
}: {
  price: SwapPrice | undefined;
  taker: Address | undefined;
  setPrice: (price: any) => void;
  setFinalize: (finalize: boolean) => void;
  chainId: number;
}) {
  const [sellToken, setSellToken] = useState("weth");
  const [buyToken, setBuyToken] = useState("usdc");
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const supportedChain = chainId === 1 || chainId === 8453;
  const availableTokens = useMemo(
    () => (chainId === 8453 ? BASE_TOKENS : MAINNET_TOKENS),
    [chainId]
  );
  const tokenMap = useMemo(
    () => Object.fromEntries(availableTokens.map((token) => [token.symbol.toLowerCase(), token])) as Record<string, Token>,
    [availableTokens]
  );
  const sell = tokenMap[sellToken];
  const buy = tokenMap[buyToken];

  // Network changes can invalidate selected tokens and every previous quote.
  useEffect(() => {
    setSellToken("weth");
    setBuyToken("usdc");
    setSellAmount("");
    setBuyAmount("");
    setPrice(undefined);
    setFinalize(false);
    setErrorMessage("");
  }, [chainId, setPrice, setFinalize]);

  const amountIsValid = !!sellAmount && /^\d+(\.\d+)?$/.test(sellAmount) && Number(sellAmount) > 0 &&
    !!sell && sellAmount.split(".")[1]?.length! <= sell.decimals;
  let parsedAmount: bigint | undefined;
  if (amountIsValid && sell) {
    try { parsedAmount = parseUnits(sellAmount, sell.decimals); } catch { /* invalid precision */ }
  }
  const balance = useTokenBalance(taker, sell, chainId);
  const insufficientBalance = parsedAmount === undefined || balance === undefined || parsedAmount > balance;
  const sameToken = !!sell && !!buy && sell.address.toLowerCase() === buy.address.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setPrice(undefined);
    setBuyAmount("");
    setErrorMessage("");
    if (!supportedChain || !sell || !buy || sameToken || parsedAmount === undefined || parsedAmount <= 0n) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = {
          chainId,
          sellToken: sell.address,
          buyToken: buy.address,
          sellAmount: parsedAmount.toString(),
          ...(taker ? { taker } : {}),
          swapFeeRecipient: FEE_RECIPIENT,
          swapFeeBps: AFFILIATE_FEE,
          swapFeeToken: buy.address,
          tradeSurplusRecipient: FEE_RECIPIENT,
        };
        const response = await fetch(`/api/price?${qs.stringify(params)}`, { signal: controller.signal });
        const data: SwapPrice = await response.json();
        if (!response.ok || !data.buyAmount) {
          throw new Error(data.message || data.validationErrors?.[0]?.reason || `Quote unavailable (${response.status})`);
        }
        if (!cancelled) {
          setBuyAmount(formatUnits(data.buyAmount, buy.decimals));
          setPrice(data);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setErrorMessage(err instanceof Error ? err.message : "Could not get a quote");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [chainId, sell?.address, buy?.address, parsedAmount?.toString(), taker, sameToken, supportedChain, setPrice]);

  const updateSell = (e: ChangeEvent<HTMLSelectElement>) => {
    setSellToken(e.target.value);
    setSellAmount("");
  };
  const updateBuy = (e: ChangeEvent<HTMLSelectElement>) => setBuyToken(e.target.value);
  const feeAmount = price?.fees?.integratorFee?.amount;
  const tax = (value?: string) => value && value !== "0" ? `${(Number(value) / 100).toFixed(2)}%` : null;
  const buyTax = tax(price?.tokenMetadata?.buyToken?.buyTaxBps);
  const sellTax = tax(price?.tokenMetadata?.sellToken?.sellTaxBps);

  return (
    <div>
      <header className="flex justify-between items-center">
        <div className="text-xl font-extrabold text-blue-600">STARSTACKS</div>
        <ConnectButton />
      </header>
      <div className="container mx-auto p-4 sm:p-10">
        <h1 className="text-3xl font-bold text-center py-4">Starstacks Exchange</h1>
        <div className="mb-4 rounded-lg border border-blue-500 bg-blue-950 p-4 text-center text-white">
          <p className="font-bold">Starstacks Exchange Service Fee: 8%</p>
          <p className="text-sm">An 8% service fee applies to eligible swaps and is reflected in your quote.</p>
        </div>
        {!supportedChain && <p role="alert">Please select Ethereum or Base.</p>}
        <div className="bg-slate-800 text-white p-4 rounded-md mb-3">
          <label htmlFor="sell-token-select">Sell</label>
          <div className="flex items-center gap-2 my-3">
            {sell?.logoURI && <img alt="" src={sell.logoURI} className="w-9 h-9 rounded-md" />}
            <select id="sell-token-select" value={sellToken} onChange={updateSell} className="text-black h-9 rounded-md max-w-[40%]">
              {availableTokens.map((token) => <option key={token.address} value={token.symbol.toLowerCase()}>{token.symbol}</option>)}
            </select>
            <input aria-label="Sell amount" value={sellAmount} className="text-black h-9 rounded-md min-w-0 flex-1 px-2" type="text" inputMode="decimal" onChange={(e) => setSellAmount(e.target.value)} placeholder="0.0" />
          </div>
          <label htmlFor="buy-token-select">Buy</label>
          <div className="flex items-center gap-2 my-3">
            {buy?.logoURI && <img alt="" src={buy.logoURI} className="w-9 h-9 rounded-md" />}
            <select id="buy-token-select" value={buyToken} onChange={updateBuy} className="text-black h-9 rounded-md max-w-[40%]">
              {availableTokens.map((token) => <option key={token.address} value={token.symbol.toLowerCase()}>{token.symbol}</option>)}
            </select>
            <input aria-label="Estimated buy amount" value={buyAmount} className="text-black h-9 rounded-md min-w-0 flex-1 px-2" readOnly placeholder="Quote pending" />
          </div>
          {loading && <p>Getting quote...</p>}
          {sameToken && <p role="alert">Choose two different tokens.</p>}
          {sellAmount && parsedAmount === undefined && <p role="alert">Enter a valid amount (maximum {sell?.decimals ?? 18} decimal places).</p>}
          {errorMessage && <p role="alert" className="text-red-300">{errorMessage}</p>}
          {feeAmount && buy && <p>Affiliate Fee: {formatUnits(feeAmount, buy.decimals)} {buy.symbol}</p>}
          {buyTax && <p>{buy?.symbol} Buy Tax: {buyTax}</p>}
          {sellTax && <p>{sell?.symbol} Sell Tax: {sellTax}</p>}
        </div>
        {!taker ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => <button type="button" onClick={openConnectModal} className="w-full bg-blue-600 text-white p-3 rounded">Connect Wallet</button>}
          </ConnectButton.Custom>
        ) : (
          <ApprovalOrReview
            chainId={chainId}
            taker={taker}
            sell={sell}
            price={price}
            parsedAmount={parsedAmount}
            disabled={!supportedChain || !buy || sameToken || loading || insufficientBalance || !!errorMessage}
            onReview={() => setFinalize(true)}
          />
        )}
      </div>
    </div>
  );
}

function ApprovalOrReview({
  chainId, taker, sell, price, parsedAmount, disabled, onReview,
}: {
  chainId: number;
  taker: Address;
  sell: Token | undefined;
  price: SwapPrice | undefined;
  parsedAmount: bigint | undefined;
  disabled: boolean;
  onReview: () => void;
}) {
  const spender = price?.issues?.allowance?.spender;
  const native = !!sell && isNative(sell.address);
  const { data: allowance, refetch } = useReadContract({
    chainId,
    address: (sell?.address ?? NATIVE_ETH) as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: spender ? [taker, spender] : undefined,
    query: { enabled: !native && !!sell && !!spender && !!price },
  });
  const { writeContractAsync, data: approvalHash, isPending, error } = useWriteContract();
  const { isLoading: isApproving, isSuccess: approved } = useWaitForTransactionReceipt({ hash: approvalHash, chainId });
  useEffect(() => { if (approved) void refetch(); }, [approved, refetch]);

  const requiredApproval = parsedAmount ?? 0n;
  const needsApproval = !native && !!spender && requiredApproval > 0n &&
    (allowance === undefined || allowance < requiredApproval);
  const canReview = !!price?.buyAmount && !disabled && (native || price.issues?.allowance === null || (!needsApproval && allowance !== undefined));

  if (!price?.buyAmount) {
    return <button type="button" disabled className="w-full bg-blue-500 text-white p-3 rounded opacity-50">Enter an amount to get a quote</button>;
  }
  if (needsApproval && sell && spender) {
    return (
      <div>
        <button type="button" disabled={disabled || isPending || isApproving || allowance === undefined}
          className="w-full bg-blue-500 text-white p-3 rounded disabled:opacity-50"
          onClick={async () => {
            if (requiredApproval <= 0n) return;
            await writeContractAsync({
              chainId: chainId as 1 | 8453,
              address: sell.address,
              abi: erc20Abi,
              functionName: "approve",
              args: [spender, requiredApproval], // exact amount, never unlimited
            });
          }}>
          {isPending || isApproving ? "Approving..." : allowance === undefined ? "Checking allowance..." : `Approve ${sell.symbol} (exact amount)`}
        </button>
        {error && <p role="alert" className="text-red-600">{error.message}</p>}
      </div>
    );
  }
  return (
    <button type="button" disabled={!canReview} onClick={onReview}
      className="w-full bg-blue-500 text-white p-3 rounded disabled:opacity-50">
      {canReview ? "Review Trade" : "Quote unavailable or insufficient balance"}
    </button>
  );
}
