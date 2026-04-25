// @vitest-environment jsdom
//
// S#38 — LaneCtaCard click + render. Q-38.I = b means click currently
// fires a toast (D1+ wires the wizard); this test owns the
// click-as-side-effect contract.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AdsLaneIcon, LaneCtaCard } from "@/client/home/LaneCtaCard"

afterEach(() => cleanup())

describe("LaneCtaCard", () => {
  it("renders title + subtitle + lane data attribute", () => {
    render(
      <LaneCtaCard
        laneId="ads"
        title="Ads Images"
        subtitle="Meta + Google Ads"
        colorVariant="violet"
        Icon={AdsLaneIcon}
        onClick={() => {}}
      />,
    )
    const card = screen.getByTestId("lane-cta-ads")
    expect(card).toHaveAttribute("data-lane", "ads")
    expect(screen.getByText("Ads Images")).toBeInTheDocument()
    expect(screen.getByText("Meta + Google Ads")).toBeInTheDocument()
  })

  it("invokes onClick exactly once per click", () => {
    const onClick = vi.fn()
    render(
      <LaneCtaCard
        laneId="aso"
        title="ASO"
        subtitle="Play Store"
        colorVariant="emerald"
        Icon={AdsLaneIcon}
        onClick={onClick}
      />,
    )
    fireEvent.click(screen.getByTestId("lane-cta-aso"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
