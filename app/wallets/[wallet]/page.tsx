import WalletDetails from "./WalletDetails";

export default async function WalletPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  return <WalletDetails wallet={decodeURIComponent(wallet)} />;
}
