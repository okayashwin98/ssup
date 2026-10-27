import { type ComponentType, createContext, useContext } from "react";
import type { TimelineLayerId } from "./timelineLayers";

/** A timeline row's icon and on/off switch, shown in the column at the row's left. */
export type TimelineRowLayer = {
	id: TimelineLayerId | "zoom";
	label: string;
	icon: ComponentType<{ className?: string }>;
};

type TimelineLayerState = {
	isOn: (id: TimelineRowLayer["id"]) => boolean;
	toggle: (id: TimelineRowLayer["id"]) => void;
};

const TimelineLayerContext = createContext<TimelineLayerState | null>(null);
export const TimelineLayerProvider = TimelineLayerContext.Provider;

export function useTimelineLayers() {
	return useContext(TimelineLayerContext);
}
