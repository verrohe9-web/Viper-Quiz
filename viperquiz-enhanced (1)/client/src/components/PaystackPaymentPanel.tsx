import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function PaystackPaymentPanel({
  roomCode,
  playerId,
  entryFeeMinor,
  paymentReference,
}: {
  roomCode: string;
  playerId: string;
  entryFeeMinor: number;
  paymentReference?: string;
}) {
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callbackReference, setCallbackReference] = useState("");
  const callbackHandled = useRef(false);
  const utils = trpc.useUtils();
  const initializePayment = trpc.game.initializePaystackPayment.useMutation();
  const verifyPayment = trpc.game.verifyPaystackPayment.useMutation();

  const verifyReference = (reference: string) => {
    verifyPayment.mutate({ roomCode, playerId, reference }, {
      onSuccess: async (result) => {
        if (result.success) {
          toast.success("Paystack confirmed your payment.");
          await utils.game.getRoom.invalidate({ roomCode, playerId });
          window.history.replaceState(null, "", window.location.pathname);
          setCallbackReference("");
          return;
        }
        if (result.status === "pending") {
          toast.info(result.message);
          return;
        }
        toast.error(result.message || "Paystack could not confirm the payment.");
      },
      onError: (error) => toast.error(error.message || "Could not verify the payment."),
    });
  };

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("paystack_reference");
    if (!reference) return;
    setCallbackReference(reference);
    if (callbackHandled.current) return;
    callbackHandled.current = true;
    verifyReference(reference);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await initializePayment.mutateAsync({
        roomCode,
        playerId,
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
      });
      if (!result.success) throw new Error(result.message || "Could not start Paystack checkout.");
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start Paystack checkout.");
    }
  };

  const busy = initializePayment.isPending || verifyPayment.isPending;

  return (
    <section className="mt-4 border-t border-[#e7e7ea] pt-4" aria-labelledby="paystack-payment-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="paystack-payment-title" className="text-base font-semibold text-[#333]">Lipa na M-Pesa</h3>
        <span className="text-xl font-semibold text-[#00a878]">KSh {(entryFeeMinor / 100).toFixed(2)}</span>
      </div>
      <p className="mt-1 text-sm text-[#777]">Pay securely through Paystack test checkout. Your room unlocks only after the server confirms the transaction.</p>
      <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email for receipt"
          aria-label="Email for Paystack receipt"
          className="min-w-0 rounded-md border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-[#333] placeholder:text-[#777] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a878]"
        />
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder="07… or 2547… (optional)"
          aria-label="M-Pesa number for checkout"
          className="min-w-0 rounded-md border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-[#333] placeholder:text-[#777] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a878]"
        />
        <Button type="submit" disabled={busy} className="bg-[#00a878] font-semibold text-white transition-colors hover:bg-[#008c65] sm:col-span-2">
          {initializePayment.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Opening checkout…</> : "Continue to Paystack"}
        </Button>
      </form>
      {callbackReference && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" role="status" aria-live="polite">
          <p className="text-sm text-[#777]">{verifyPayment.isPending ? "Verifying payment with Paystack…" : "Payment confirmation is pending."}</p>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => verifyReference(callbackReference)}>
            {verifyPayment.isPending ? "Checking…" : "Check payment"}
          </Button>
        </div>
      )}
      {paymentReference && !callbackReference && (
        <p className="mt-3 text-xs text-[#777]">Payment reference: <span className="font-mono">{paymentReference}</span></p>
      )}
    </section>
  );
}
