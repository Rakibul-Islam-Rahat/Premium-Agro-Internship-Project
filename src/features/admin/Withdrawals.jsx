import PageHeader from "@/components/common/PageHeader";
import { TxQueue } from "./queue";

export default function Withdrawals() {
  return (
    <>
      <PageHeader title="Withdrawal Requests" description="Approve after sending the money to the investor’s account." />
      <TxQueue type="WITHDRAW" />
    </>
  );
}
