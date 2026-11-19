import { DashboardAnnouncements } from "./DashboardAnnouncements";
import { Card, Modal } from "@heroui/react";
import { DashboardFilters } from "./DashboardFilters";
import { DashboardGrid } from "./DashboardGrid";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardToolbar } from "./DashboardToolbar";
import type { DashboardProps } from "./types";
import { useDashboardModel } from "./useDashboardModel";
import { BulkImportDialog } from "./BulkImportDialog";
import { useState } from "react";
import type { MediaBatchPick } from "../project/useProjectOpenActions";
export function Dashboard(props: DashboardProps) {
	const model = useDashboardModel(props);
	const view = { ...props, ...model };
	const [batch, setBatch] = useState<MediaBatchPick | null>(null);
	const importFiles = async () => {
		const picked = await props.onImportFile({ multiple: true });
		if (picked) setBatch(picked);
	};
	return (
		<>
			<Modal isOpen={props.open} onOpenChange={props.onOpenChange}>
				<Modal.Backdrop>
					<Modal.Container size="full">
						<Modal.Dialog
							aria-label="Projects dashboard"
							className="dashboard-surface dashboard-shell flex h-full flex-row gap-0 rounded-none bg-background p-0 text-foreground"
						>
							<DashboardSidebar {...view} />
							<Card className="my-3 mr-3 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-2xl bg-background p-0 shadow-sm">
								{model.section !== "settings" && model.section !== "shared" && (
									<>
										<DashboardAnnouncements />
										<DashboardToolbar {...view} onImportFile={importFiles} />
										<DashboardFilters {...view} flush />
									</>
								)}
								<DashboardGrid {...view} />
							</Card>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
			<BulkImportDialog
				batch={batch}
				folders={model.folders}
				save={model.save}
				initialFolderId={
					model.folders.some((folder) => folder.id === model.section)
						? model.section
						: null
				}
				onClose={() => setBatch(null)}
				onShowFolder={model.setSection}
			/>
		</>
	);
}
