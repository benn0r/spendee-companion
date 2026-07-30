"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";
import { assetUrl } from "@/lib/assets";

export default function Brand({
  onClick,
}: {
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link className="brand brand-link" href="/" onClick={onClick}>
      <img
        alt=""
        aria-hidden="true"
        className="brandmark"
        src={assetUrl("/icon.png")}
      />
      <div>
        <strong>Spendee companion</strong>
        <small>Transaction archive</small>
      </div>
    </Link>
  );
}
