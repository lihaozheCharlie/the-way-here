// Stable entry for shared document surfaces; implementation stays separated by responsibility.
export { EditableDocument } from "./EditableDocument";
export { ReadOnlyDocument } from "./DocumentFrame";
export { DocumentOutline } from "./DocumentOutline";
export { MarkdownBody } from "./MarkdownBody";
export { documentHeadingPrefix, documentIdentity, editableMarkdownDocument, markdownOutline, markdownWithoutSourceRelations, shouldEnterDocumentEditMode } from "./document-model";
