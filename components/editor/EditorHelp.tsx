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
              <p>Choose Draw, then click an empty grid cell. Snap sets the subdivision.</p>
            </div>
          </li>
          <li>
            <span className="help-icon">
              <Move />
            </span>
            <div>
              <strong>Select and move notes</strong>
              <p>
                Choose Select and drag a box around notes. Shift-click toggles a note in the
                selection. Drag a selected note body to move the group in time or pitch. Escape
                clears the selection.
              </p>
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
              <strong>Delete selected notes</strong>
              <p>
                Press Delete or Backspace to remove the selection. Right-click removes one note.
              </p>
            </div>
          </li>
        </ul>
        <p className="editor-help-footer">
          Play to listen. Loop repeats your four bars. Press Enter in the title or tempo field to
          save. Save keeps edits private; Publish shares them. Key is a label and does not transpose
          notes.
        </p>
      </DialogContent>
    </Dialog>
  );
}
