import '@testing-library/jest-dom/vitest'

// jsdom has <dialog> but not showModal() or close(). A minimal stand-in: open/close the
// element and fire the 'close' event, which is all the app relies on.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
