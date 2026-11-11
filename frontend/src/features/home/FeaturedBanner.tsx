// The home page's featured banner, from the first entry of the banner feed.
import { useQuery } from "@tanstack/react-query";
import { CTA } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import type { BannerButton } from "../../lib/api/types/home";
import type { PublicConfig } from "../../lib/api/types/session";
import { bannerQuery } from "../../lib/queries";
import { bannerButtonVariant, isOtherSite } from "./banner";
import { BannerInfo } from "./BannerInfo";

/**
 * The first entry of the featured banner feed, in the library CTA: its
 * picture behind a panel holding the title, subtitle and buttons. Without a
 * picture the panel stands on the page as the library draws it.
 *
 * Horizon puts the fine print (`info`) between the subtitle and the
 * buttons; the CTA has no slot there, so it follows the buttons in the slot
 * the CTA keeps for anything after them.
 */
export function FeaturedBanner({
  config,
}: {
  config: PublicConfig | undefined;
}) {
  const { data } = useQuery({
    ...bannerQuery(config?.banner_url ?? null),
    enabled: Boolean(config?.banner_url),
  });
  if (!data?.title) return null;
  const buttons = [data.button1, data.button2].filter(
    (button): button is BannerButton => Boolean(button?.link && button.text),
  );
  return (
    <CTA
      title={data.title}
      subtitle={data.subtitle}
      image={data.bg_image ? { src: data.bg_image, alt: "" } : undefined}
      // With no picture to rest on, the panel spans the band, centred,
      // rather than leaving the band's right side empty.
      contentPlacement={data.bg_image ? "left" : "wide"}
      size="small"
      actions={
        buttons.length > 0 ? (
          <>
            {buttons.map((button) => (
              <AppLink
                key={button.link}
                variant={bannerButtonVariant(button.color)}
                size="sm"
                href={button.link}
                newTab={isOtherSite(button.link, window.location.origin)}
              >
                {button.text}
              </AppLink>
            ))}
          </>
        ) : undefined
      }
    >
      {data.info && <BannerInfo html={data.info} />}
    </CTA>
  );
}
