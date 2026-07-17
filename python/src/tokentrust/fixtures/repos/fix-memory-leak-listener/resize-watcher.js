// Bug: every call to attachResizeHandler() adds a new 'resize' listener
// without removing the one added by the previous call, so listeners pile up
// and each resize event fires the callback once per previous attach.

let currentHandler = null;

function attachResizeHandler(target, callback) {
  target.addEventListener('resize', callback);
  currentHandler = callback;
}

module.exports = { attachResizeHandler };
