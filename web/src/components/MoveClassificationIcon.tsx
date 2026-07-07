import { MoveClassification } from "../types/chess-types";

interface Props {
  classification?: string | null;
  size?: number;
}

const iconMap: Record<string, string> = {
  [MoveClassification.Blunder]: "/icons/blunder.png",
  [MoveClassification.Mistake]: "/icons/mistake.png",
  [MoveClassification.Inaccuracy]: "/icons/inaccuracy.png",
  [MoveClassification.Okay]: "/icons/okay.png",
  [MoveClassification.Excellent]: "/icons/excellent.png",
  [MoveClassification.Best]: "/icons/best.png",
  [MoveClassification.Forced]: "/icons/forced.png",
  [MoveClassification.Opening]: "/icons/opening.png",
  [MoveClassification.Perfect]: "/icons/perfect.png",
  [MoveClassification.Splendid]: "/icons/splendid.png",
};

export default function MoveClassificationIcon({
  classification,
  size = 20,
}: Props) {
  if (!classification) {
    return null;
  }

  const src = iconMap[classification];

  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={classification}
      title={classification}
      width={size}
      height={size}
      className="inline-block"
    />
  );
}
