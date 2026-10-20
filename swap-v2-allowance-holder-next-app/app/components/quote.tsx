import { useEffect } from "react";
import { formatUnits } from "ethers";
import {
  useSignTypedData,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWalletClient,
  type BaseError,
} from "wagmi";
import { Address, concat, numberToHex, size, type Hex } from "viem";
import type { PriceResponse, QuoteResponse } from "../../src/utils/types";
import {
  MAINNET_TOKENS_BY_ADDRESS,
  BASE_TOKENS_BY_ADDRESS,
  AFFILIATE_FEE,
  FEE_RECIPIENT,
} from "../../src/constants";
import Image from "next/image";
import qs from "qs";

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
  setQuote: (price: any) => void;
  chainId: number;
}) {
  console.log("price", price);

  const sellTokenInfo = (chainId: number) => {
  if (chainId === 8453) {
    return BASE_TOKENS_BY_ADDRESS[price.sellToken.toLowerCase()];
  }
  return MAINNET_TOKENS_BY_ADDRESS[price.sellToken.toLowerCase()];
};
  };

  const buyTokenInfo = (chainId: number) => {
  if (chainId === 8453) {
    return BASE_TOKENS_BY_ADDRESS[price.buyToken.toLowerCase()];
  }
  return MAINNET_TOKENS_BY_ADDRESS[price.buyToken.toLowerCase()];
};

  const { signTypedDataAsync } = useSignTypedData();
  const { data: walletClient } = useWalletClient();

  // Fetch quote data
  useEffect(() => {
    const params = {
      chainId: chainId,
      sellToken: price.sellToken,
      buyToken: price.buyToken,
      sellAmount: price.sellAmount,
      taker,
      swapFeeRecipient: FEE_RECIPIENT,
      swapFeeBps: AFFILIATE_FEE,
      swapFeeToken: price.buyToken,
      tradeSurplusRecipient: FEE_RECIPIENT,
    };

    async function main() {
      const response = await fetch(`/api/quote?${qs.stringify(params)}`);
      const data = await response.json();
      setQuote(data);
    }
    main();
  }, [
    chainId,
    price.sellToken,
    price.buyToken,
    price.sellAmount,
    taker,
    setQuote,
    FEE_RECIPIENT,
    AFFILIATE_FEE,
  ]);

  const {
    data: hash,
    isPending,
    error,
    sendTransaction,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  if (!quote) {
    return <div>Getting best quote...</div>;
  }

  console.log("quote", quote);

  // Helper function to format tax basis points to percentage
  const formatTax = (taxBps: string) => (parseFloat(taxBps) / 100).toFixed(2);

  return (
    <div className="p-3 mx-auto max-w-screen-sm ">
      <form>
      <div className="bg-slate-200 dark:bg-slate-800 p-4 rounded-sm mb-3">
  <div className="text-xl mb-2 text-white">You pay</div>

  <div className="flex items-center text-lg sm:text-3xl text-white">
    {sellTokenInfo(chainId) ? (
      <>
        <Image
          alt={sellTokenInfo(chainId).symbol}
          className="h-9 w-9 mr-2 rounded-md"
          src={sellTokenInfo(chainId).logoURI}
          width={36}
          height={36}
        />

        <span>
          {formatUnits(
            quote.sellAmount,
            sellTokenInfo(chainId).decimals
          )}
        </span>

        <div className="ml-2">
          {sellTokenInfo(chainId).symbol}
        </div>
      </>
    ) : (
      <span>Token unavailable</span>
    )}
  </div>
</div>
        </div>

        <div className="bg-slate-200 dark:bg-slate-800 p-4 rounded-sm mb-3">
          <div className="text-xl mb-2 text-white">You receive</div>
          <div className="flex items-center text-lg sm:text-3xl text-white">
            <img
  alt={buyTokenInfo(chainId)?.symbol || "Token"}
  className="h-9 w-9 mr-2 rounded-md"
  src={buyTokenInfo(chainId)?.logoURI || ""}
/>
            <span>
              {buyTokenInfo(chainId)
  ? formatUnits(quote.buyAmount, buyTokenInfo(chainId).decimals)
  : "Token unavailable"}
            </span>
            <div className="ml-2">{buyTokenInfo(chainId).symbol}</div>
          </div>
        </div>

        <div className="bg-slate-200 dark:bg-slate-800 p-4 rounded-sm mb-3">
         <div className="text-slate-400">
  {quote?.fees?.integratorFee?.amount && buyTokenInfo(chainId)
    ? "Affiliate Fee: " +
      Number(
        formatUnits(
          BigInt(quote.fees.integratorFee.amount),
          buyTokenInfo(chainId).decimals
        )
      ) +
      " " +
      buyTokenInfo(chainId).symbol
    : null}
</div>
              : null}
          </div>
      {/* Tax Information Display */}
<div className="text-slate-400">
  {quote?.tokenMetadata?.buyToken?.buyTaxBps &&
    quote.tokenMetadata.buyToken.buyTaxBps !== "0" &&
    buyTokenInfo(chainId) && (
      <p>
        {buyTokenInfo(chainId).symbol} Buy Tax:{" "}
        {formatTax(quote.tokenMetadata.buyToken.buyTaxBps)}%
      </p>
    )}

  {quote?.tokenMetadata?.sellToken?.sellTaxBps &&
    quote.tokenMetadata.sellToken.sellTaxBps !== "0" &&
    sellTokenInfo(chainId) && (
      <p>
        {sellTokenInfo(chainId).symbol} Sell Tax:{" "}
        {formatTax(quote.tokenMetadata.sellToken.sellTaxBps)}%
      </p>
    )}
</div>
    </div>
      </form>

      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
        disabled={isPending}
        onClick={async () => {
          console.log("submitting quote to blockchain");
          console.log("to", quote.transaction.to);
          console.log("value", quote.transaction.value);

          // Submit the transaction onchain
          sendTransaction &&
            sendTransaction({
              account: walletClient?.account.address,
              gas: !!quote?.transaction.gas
                ? BigInt(quote?.transaction.gas)
                : undefined,
              to: quote?.transaction.to,
              data: quote.transaction.data,
              value: quote?.transaction.value
                ? BigInt(quote.transaction.value)
                : undefined, // value is used for native tokens
              chainId: chainId,
            });
        }}
      >
        {isPending ? "Confirming..." : "Place Order"}
      </button>
      <br></br>
      <br></br>
      <br></br>
      {isConfirming && (
        <div className="text-center">Waiting for confirmation ⏳ ...</div>
      )}
      {isConfirmed && (
        <div className="text-center">
          Transaction Confirmed! 🎉{" "}
          <a href={`https://etherscan.io/tx/${hash}`}>Check Etherscan</a>
        </div>
      )}
      {error && (
        <div>Error: {(error as BaseError).shortMessage || error.message}</div>
      )}
    </div>
  );
}
