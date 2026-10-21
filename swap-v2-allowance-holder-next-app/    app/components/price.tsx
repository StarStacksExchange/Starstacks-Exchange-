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
import type { PriceResponse } from "../../src/utils/types";

const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const isNative = (address: string) => address.toLowerCase() === NATIVE_ETH;

export const DEFAULT_BUY_TOKEN = (_chainId: number) => "weth";

type Token = (typeof MAINNET_TOKENS)[number];

// The API may return allowance instructions that are not included in the
// project's current PriceResponse definition. Treat them as optional.
type PriceWithIssues = PriceResponse & {
  issues?: { allowance?: { spender: Address } | null };
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
  price: PriceWithIssues | undefined;
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
        const data: PriceResponse & { message?: string; validationErrors?: Array<{ reason?: string }> } = await response.json();
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

  return (
    <div className="w-full max-w-5xl mx-auto">
      <header className="flex flex-wrap justify-between items-center gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3"><div className="brand-mark">S</div><div><div className="text-lg sm:text-xl font-extrabold tracking-[0.14em] text-white">STARSTACKS</div><div className="text-[10px] tracking-[0.28em] text-slate-400">EXCHANGE</div></div></div>
        <ConnectButton />
      </header>
      <div className="max-w-xl mx-auto py-10 sm:py-16">
        <div className="mb-8 text-center"><p className="text-xs uppercase tracking-[0.35em] text-blue-300 mb-3">Digital asset trading</p><h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">Trade with clarity.</h1><p className="mt-4 text-slate-400 text-sm sm:text-base">Exchange supported tokens across Ethereum and Base. Review every quote before you sign.</p></div>
        <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-center text-slate-200">
          <p className="font-semibold">Service fee · 8% on eligible swaps</p>
          <p className="text-xs text-slate-400 mt-1">Estimated fees are shown in your quote. Network costs may apply separately.</p>
        </div>
        {!supportedChain && <p role="alert">Please select Ethereum or Base.</p>}
        <div className="swap-card text-white p-5 sm:p-7 rounded-3xl mb-4">
          <label htmlFor="sell-token-select">Sell</label>
          <div className="flex items-center gap-2 my-3">
            {sell?.logoURI && <img alt="" src={sell.logoURI} className="w-9 h-9 rounded-md" />}
            <select id="sell-token-select" value={sellToken} onChange={updateSell} className="token-select h-12 rounded-xl max-w-[40%]">
              {availableTokens.map((token) => <option key={token.address} value={token.symbol.toLowerCase()}>{token.symbol}</option>)}
            </select>
            <input aria-label="Sell amount" value={sellAmount} className="amount-input h-12 rounded-xl min-w-0 flex-1 px-3" type="text" inputMode="decimal" onChange={(e) => setSellAmount(e.target.value)} placeholder="0.0" />
          </div>
          <label htmlFor="buy-token-select">Buy</label>
          <div className="flex items-center gap-2 my-3">
            {buy?.logoURI && <img alt="" src={buy.logoURI} className="w-9 h-9 rounded-md" />}
            <select id="buy-token-select" value={buyToken} onChange={updateBuy} className="token-select h-12 rounded-xl max-w-[40%]">
              {availableTokens.map((token) => <option key={token.address} value={token.symbol.toLowerCase()}>{token.symbol}</option>)}
            </select>
            <input aria-label="Estimated buy amount" value={buyAmount} className="amount-input h-12 rounded-xl min-w-0 flex-1 px-3" readOnly placeholder="Quote pending" />
          </div>
          {loading && <p>Getting quote...</p>}
          {sameToken && <p role="alert">Choose two different tokens.</p>}
          {sellAmount && parsedAmount === undefined && <p role="alert">Enter a valid amount (maximum {sell?.decimals ?? 18} decimal places).</p>}
          {errorMessage && <p role="alert" className="text-red-300">{errorMessage}</p>}
          {feeAmount && buy && <p>Affiliate Fee: {formatUnits(feeAmount, buy.decimals)} {buy.symbol}</p>}
        </div>
        {!taker ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => <button type="button" onClick={openConnectModal} className="action-button w-full text-white p-4 rounded-2xl font-semibold">Connect Wallet</button>}
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
        <p className="text-center text-xs text-slate-500 mt-6">Non-custodial swaps · You control your wallet · Always verify transaction details</p>
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
  price: PriceWithIssues | undefined;
  parsedAmount: bigint | undefined;
  disabled: boolean;
  onReview: () => void;
}) {
  // 0x v2 allowance-holder responses may expose allowanceTarget rather than issues.allowance.
  // Only trust the spender supplied by the quote service, never the transaction target.
  const spender = price?.issues?.allowance?.spender ?? price?.allowanceTarget;
  const native = !!sell && isNative(sell.address);
  const { data: allowance, refetch, isError: allowanceError, error: allowanceReadError, isPending: allowancePending } = useReadContract({
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
  const canReview = !!price?.buyAmount && !disabled && (native || (!needsApproval && allowance !== undefined));

  if (!price?.buyAmount) {
    return <button type="button" disabled className="action-button w-full text-white p-4 rounded-2xl opacity-50">Enter an amount to get a quote</button>;
  }
  // A price response without a spender is not proof that an ERC-20 is approved.
  // Fail closed rather than submitting an unsafe swap or displaying an endless spinner.
  if (!native && !spender) {
    return <p role="alert" className="rounded bg-red-100 p-3 text-red-900">Approval unavailable: the price API did not provide an allowance spender. Verify the /api/price response and its issues.allowance field. Swapping is disabled.</p>;
  }
  if (!native && allowanceError) {
    return <div role="alert" className="rounded bg-red-100 p-3 text-red-900">Allowance check failed: {allowanceReadError?.message ?? "RPC error"}. <button type="button" onClick={() => void refetch()} className="underline">Retry</button></div>;
  }
  if (needsApproval && sell && spender) {
    return (
      <div>
        <button type="button" disabled={disabled || isPending || isApproving || allowance === undefined}
          className="action-button w-full text-white p-4 rounded-2xl font-semibold disabled:opacity-50"
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
          {isPending || isApproving ? "Approving..." : allowance === undefined ? (allowancePending ? "Checking allowance..." : "Allowance unavailable — retry") : `Approve ${sell.symbol} (exact amount)`}
        </button>
        {error && <p role="alert" className="text-red-600">{error.message}</p>}
      </div>
    );
  }
  return (
    <button type="button" disabled={!canReview} onClick={onReview}
      className="action-button w-full text-white p-4 rounded-2xl font-semibold disabled:opacity-50">
      {canReview ? "Review Trade" : "Quote unavailable or insufficient balance"}
    </button>
  );
}
