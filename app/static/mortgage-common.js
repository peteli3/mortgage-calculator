// Utilities shared across the mortgage-calculator pages
// (index, amortization, buy-vs-rent). Defined at global scope so that
// inline page scripts can call them directly.

var STORAGE_KEY = 'mortgage_loans';
var SELECTED_KEY = 'mortgage_selected_loan';

function loadLoans() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch(e) { return []; }
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Dollar inputs: format value with commas as the user types, preserving
// caret position relative to digits-to-the-right.
function applyCommaFormat(input) {
    var raw = input.value.replace(/[^0-9]/g, '');
    var digitsRight = input.value.slice(input.selectionStart).replace(/[^0-9]/g, '').length;
    var formatted = raw ? Number(raw).toLocaleString('en-US') : '';
    input.value = formatted;
    if (digitsRight === 0) {
        input.setSelectionRange(formatted.length, formatted.length);
    } else {
        var count = 0;
        var pos = formatted.length;
        for (var i = formatted.length - 1; i >= 0; i--) {
            if (/[0-9]/.test(formatted[i])) {
                count++;
                if (count === digitsRight) { pos = i; break; }
            }
        }
        input.setSelectionRange(pos, pos);
    }
}

function fmtDollarField(val) {
    return val > 0 ? Number(val).toLocaleString('en-US') : '';
}

// Returns { text, title } for preview panel values.
// Values >= $1B switch to e-notation (3 sig figs); title holds the full value
// for display in a hover tooltip, otherwise title is null.
function fmtPreview(val) {
    if (!isFinite(val) || isNaN(val)) return { text: '—', title: null };
    var rounded = Math.round(val);
    var abs = Math.abs(rounded);
    var sign = rounded < 0 ? '-' : '';
    if (abs >= 1000000000) {
        var full = sign + '$' + abs.toLocaleString();
        return { text: sign + '$' + abs.toExponential(2), title: full };
    }
    return { text: sign + '$' + abs.toLocaleString(), title: null };
}

function setPreviewVal(id, show, val) {
    var el = document.getElementById(id);
    if (!show) { el.textContent = '—'; el.removeAttribute('title'); return; }
    var r = fmtPreview(val);
    el.textContent = r.text;
    if (r.title) { el.title = r.title; } else { el.removeAttribute('title'); }
}
