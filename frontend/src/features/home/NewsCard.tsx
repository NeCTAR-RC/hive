// One ARDC news article as a library card.
import { ImageCard, ImpactCard, type ImpactCardProps } from "@ardc-ui/react";
import type { NewsItem } from "../../lib/api/types/home";
import { formatDate } from "../../lib/format";

/**
 * One news article as a library card leading to the article in a new tab.
 * An article with a picture takes the image card, with the date above its
 * title; one without (the ARDC feed carries none today) takes the card of
 * date, title and summary, grey so it stands out from the white panel.
 */
export function NewsCard({ item }: { item: NewsItem }) {
  const date = formatDate(item.published) || item.published;
  const common = {
    title: (
      <>
        {item.title}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </>
    ),
    description: item.summary || undefined,
    href: item.link,
    target: "_blank",
    rel: "noopener noreferrer",
  } satisfies Partial<ImpactCardProps>;
  if (item.image) {
    return (
      <ImageCard
        {...common}
        image={{ src: item.image, alt: "" }}
        topDate={date}
      />
    );
  }
  return <ImpactCard {...common} date={date} tone="grey" />;
}
