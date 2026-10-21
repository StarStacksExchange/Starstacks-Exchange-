import { useEffect, useState } from "react";
import { formatUnits } from "ethers";
import {
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWalletClient,
  useChainId,
  type BaseError,
} from "wagmi";
import type { Address } from "viem";
import type { PriceResponse, QuoteResponse } from "../../src/utils/types";
import {
  MAINNET_TOKENS_BY_ADDRESS,
  BASE_TOKENS_BY_ADDRESS,
  AFFILIATE_FEE,
  FEE_RECIPIENT,
} from "../../src/constants";
import Image from "next/image";
import qs from "qs";

const tokenKey = (address: string) => address.toLowerCase();

export default function QuoteView({
  taker,
  price,
  quote,
  setQuote,
  chainId,
}: {
  taker: Address | undefined;
  price: PriceResponse;
  quote: QuoteResponse | undefined;
  setQuote: (quote: any) => void;
  chainId: number;
}) {
  const [quoteError, setQuoteError] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const { data: walletClient } = useWalletClient();
  const connectedChainId = useChainId();
  const { data: hash, isPending, error, sendTransaction } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const tokenMap =
    chainId === 8453 ? BASE_TOKENS_BY_ADDRESS : MAINNET_TOKENS_BY_ADDRESS;
  const sellTokenInfo = tokenMap[tokenKey(price.sellToken)];
  const buyTokenInfo = tokenMap[tokenKey(price.buyToken)];
  const validChain = chainId === 1 || chainId === 8453;
  const chainMatches = connectedChainId === chainId;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setQuote(undefined);
    setQuoteError("");

    if (!validChain || !taker || !sellTokenInfo || !buyTokenInfo) {
      setQuoteError("Connect your wallet and choose supported tokens to request a quote.");
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    async function fetchQuote() {
      setIsFetching(true);
      try {
        const params = {
          chainId,
          sellToken: price.sellToken,
          buyToken: price.buyToken,
          sellAmount: price.sellAmount,
          taker,
          swapFeeRecipient: FEE_RECIPIENT,
          swapFeeBps: AFFILIATE_FEE,
          swapFeeToken: price.buyToken,
          tradeSurplusRecipient: FEE_RECIPIENT,
        };
        const response = await fetch(`/api/quote?${qs.stringify(params)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data?.transaction?.to || !data?.transaction?.data) {
          throw new Error(data?.reason || data?.message || "Could not obtain a valid swap quote.");
        }
        if (!cancelled) setQuote(data);
      } catch (err) {
        if (!cancelled) {
          setQuoteError(err instanceof Error ? err.message : "Unable to fetch quote.");
          setQuote(undefined);
        }
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    }

    fetchQuote();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    chainId,
    price.sellToken,
    price.buyToken,
    price.sellAmount,
    taker,
    setQuote,
    validChain,
    sellTokenInfo,
    buyTokenInfo,
  ]);

  const formatAmount = (amount: string, decimals: number) => {
    try {
      return formatUnits(amount, decimals);
    } catch {
      return "Unavailable";
    }
  };
  const formatTax = (taxBps: string) => (Number(taxBps) / 100).toFixed(2);
  const feeAmount = quote?.fees?.integratorFee?.amount;
  const explorer = chainId === 8453 ? "https://basescan.org/tx/" : "https://etherscan.io/tx/";
  const readyToSubmit =
    !!quote?.transaction?.to &&
    !!quote?.transaction?.data &&
    !!walletClient?.account?.address &&
    !!taker &&
    walletClient.account.address.toLowerCase() === taker.toLowerCase() &&
    chainMatches &&
    validChain &&
    !!sellTokenInfo &&
    !!buyTokenInfo;

  return (
    <div className="w-full max-w-xl mx-auto mt-8 p-5 sm:p-8 swap-card rounded-3xl">
      <div className="bg-slate-900/70 border border-slate-700 p-4 rounded-xl mb-3">
        <div className="text-xl mb-2">You pay</div>
        <div className="flex items-center gap-2 text-lg sm:text-3xl">
          {sellTokenInfo ? (
            <>
              {sellTokenInfo.logoURI && (
                <Image
                  alt={sellTokenInfo.symbol}
                  className="h-9 w-9 rounded-md"
                  src={sellTokenInfo.logoURI}
                  width={36}
                  height={36}
                />
              )}
              <span>{quote ? formatAmount(quote.sellAmount, sellTokenInfo.decimals) : "—"}</span>
              <span>{sellTokenInfo.symbol}</span>
            </>
          ) : (
            <span>Sell token unavailable on this network</span>
          )}
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-700 p-4 rounded-xl mb-3">
        <div className="text-xl mb-2">You receive</div>
        <div className="flex items-center gap-2 text-lg sm:text-3xl">
          {buyTokenInfo ? (
            <>
              {buyTokenInfo.logoURI && (
                <Image
                  alt={buyTokenInfo.symbol}
                  className="h-9 w-9 rounded-md"
                  src={buyTokenInfo.logoURI}
                  width={36}
                  height={36}
                />
              )}
              <span>{quote ? formatAmount(quote.buyAmount, buyTokenInfo.decimals) : "—"}</span>
              <span>{buyTokenInfo.symbol}</span>
            </>
          ) : (
            <span>Buy token unavailable on this network</span>
          )}
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-700 p-4 rounded-xl mb-3">
        {feeAmount && buyTokenInfo ? (
          <div>
            Affiliate fee: {formatAmount(String(feeAmount), buyTokenInfo.decimals)}{" "}
            {buyTokenInfo.symbol}
          </div>
        ) : null}
        {quote?.tokenMetadata?.buyToken?.buyTaxBps &&
          quote.tokenMetadata.buyToken.buyTaxBps !== "0" &&
          buyTokenInfo && (
            <p>
              {buyTokenInfo.symbol} buy tax: {formatTax(quote.tokenMetadata.buyToken.buyTaxBps)}%
            </p>
          )}
        {quote?.tokenMetadata?.sellToken?.sellTaxBps &&
          quote.tokenMetadata.sellToken.sellTaxBps !== "0" &&
          sellTokenInfo && (
            <p>
              {sellTokenInfo.symbol} sell tax: {formatTax(quote.tokenMetadata.sellToken.sellTaxBps)}%
            </p>
          )}
      </div>

      {isFetching && <p>Getting best quote...</p>}
      {quoteError && <p role="alert" className="text-red-500 mb-3">{quoteError}</p>}
      {!chainMatches && <p className="text-amber-500 mb-3">Switch your wallet to the selected network.</p>}
      <button
        type="button"
        className="action-button text-white font-bold py-4 px-4 rounded-xl w-full disabled:opacity-50"
        disabled={!readyToSubmit || isPending || isConfirming || isFetching}
        onClick={() => {
          if (!readyToSubmit || !quote) return;
          sendTransaction({
            account: walletClient!.account.address,
            to: quote.transaction.to,
            data: quote.transaction.data,
            gas: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined,
            value: quote.transaction.value ? BigInt(quote.transaction.value) : undefined,
            chainId,
          });
        }}
      >
        {isPending ? "Confirm in wallet..." : "Place Order"}
      </button>
      {isConfirming && <p className="text-center mt-3">Waiting for confirmation ⏳</p>}
      {isConfirmed && hash && (
        <p className="text-center mt-3">
          Transaction confirmed!{" "}
          <a href={`${explorer}${hash}`} target="_blank" rel="noopener noreferrer">
            View transaction
          </a>
        </p>
      )}
      {error && <p role="alert">Error: {(error as BaseError).shortMessage || error.message}</p>}
    </div>
  );
}
