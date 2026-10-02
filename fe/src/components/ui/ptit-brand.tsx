import Image from 'next/image';

export function PtitBrand({ compact = false }: { compact?: boolean }) {
  return <span className="ptit-brand">
    <span className="ptit-logo"><Image src="/ptit-logo.png" alt="PTIT" width={50} height={42} priority /></span>
    {!compact && <span className="ptit-brand-copy">SmartCampus<span>Pay</span><small>THANH TOÁN NỘI BỘ · PTIT</small></span>}
  </span>;
}
