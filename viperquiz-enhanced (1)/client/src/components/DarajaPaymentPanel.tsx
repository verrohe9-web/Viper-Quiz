import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function DarajaPaymentPanel({ roomCode, playerId }: { roomCode: string; playerId: string }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const utils = trpc.useUtils();
  const requestPayment = trpc.game.requestDarajaPayment.useMutation();

  const submit = async () => {
    const normalized = phoneNumber.trim();
    if (!/^(?:254|0)7\d{8}$/.test(normalized)) {
      toast.error("Enter a valid Kenyan M-Pesa number, for example 0712345678.");
      return;
    }
    try {
      const result = await requestPayment.mutateAsync({ roomCode, playerId, phoneNumber: normalized });
      if (!result.success) throw new Error(result.message || "Daraja payment is not ready");
      await utils.game.getRoom.invalidate({ roomCode, playerId });
      toast.success("M-Pesa STK Push initiated. Approve it on your phone.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not initiate Daraja payment");
    }
  };

  return (
    <section className="mt-4 border-t border-[#e7e7ea] pt-4" aria-labelledby="mpesa-payment-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="mpesa-payment-title" className="text-base font-semibold text-[#333]">
          Lipa na M-Pesa
        </h3>
        <span className="text-xl font-semibold text-[#00a878]">KSh 10</span>
      </div>
      <p className="mt-1 text-sm text-[#777]">
        Enter the number that should receive the STK Push. The host can review payment status; winner payouts are handled separately.
      </p>
      {requestPayment.isPending && (
        <p role="status" className="mt-2 text-sm font-medium text-[#008c65]">
          Sending the payment prompt…
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
          inputMode="tel"
          placeholder="0712345678"
          aria-label="M-Pesa STK Push number"
          className="min-w-0 flex-1 rounded-md border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-[#333] placeholder:text-[#777] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a878]"
        />
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={requestPayment.isPending}
          className="bg-[#00a878] font-semibold text-white transition-colors hover:bg-[#008c65]"
        >
          {requestPayment.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            "Request STK Push"
          )}
        </Button>
      </div>
    </section>
  );
}
