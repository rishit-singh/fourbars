"use client";
import { CircleHelp, MousePointer2, Move, MoveHorizontal, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditorHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" aria-label="Editor help">
          <CircleHelp data-icon="inline-start" /> Help
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Using the piano roll</DialogTitle>
          <DialogDescription>Shape your four-bar melody with the grid.</DialogDescription>
        </DialogHeader>
        <ul className="editor-help-steps">
          <li>
            <span className="help-icon">
              <MousePointer2 />
            </span>
            <div>
              <strong>Place a note</strong>
              <p>Click an empty grid cell. Snap controls the size of each subdivision.</p>
            </div>
          </li>
          <li>
            <span className="help-icon">
              <Move />
            </span>
            <div>
              <strong>Move the note body</strong>
              <p>Drag the wide part left or right for time, up or down for pitch.</p>
            </div>
          </li>
          <li>
            <span className="help-icon">
              <MoveHorizontal />
            </span>
            <div>
              <strong>Resize the right edge</strong>
              <span className="help-note" aria-hidden="true">
                <span />
              </span>
              <p>Drag the striped edge to make a note longer or shorter.</p>
            </div>
          </li>
          <li>
            <span className="help-icon">
              <Delete />
            </span>
            <div>
              <strong>Delete a selected note</strong>
              <p>Click a note, then press Delete or Backspace. Right-click also removes it.</p>
            </div>
          </li>
        </ul>
        <p className="editor-help-footer">
          Play to listen. Loop repeats your four bars. Save keeps edits private; Publish shares
          them.
        </p>
      </DialogContent>
    </Dialog>
  );
}
