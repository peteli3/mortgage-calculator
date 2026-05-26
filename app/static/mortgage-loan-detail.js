// Utilities shared between the amortization and buy-vs-rent pages.
// Both pages render the loan-detail modal (_loan_detail_modal.html) and the
// floating preview panel (_preview_panel.html). Page-local helpers used here
// (fmtCurrency, fmtPct, loadLoans, setPreviewVal) are defined either in
// mortgage-common.js or inline in the page.

function fmtPct(val) {
    if (!val && val !== 0) return '—';
    return val.toFixed(3) + '%';
}

function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); });
    return e;
}

function buildSvgPath(pts) {
    if (!pts.length) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length; i++) {
        d += 'L' + pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1);
    }
    return d;
}

// Populate the "Adjustable Rate Details" block in the loan detail modal.
// Hidden entirely for Fixed loans so the modal layout is unchanged.
//
// Terminal rates per scenario are taken from the per-month rate schedule
// returned by buildRateSchedule(), so any future change to ARM rate-step
// rules propagates here without duplicating the cap math.
function renderArmDetailSection(loan) {
    var section = document.getElementById('modal-arm-section');
    if (!section) return;
    if (loan.loan_type !== 'arm' || !loan.arm) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');

    var arm = loan.arm;
    var fixedMonths = (arm.fixed_period_years || 0) * 12;

    document.getElementById('modal-arm-product').textContent       = armProductLabel(loan);
    document.getElementById('modal-arm-margin').textContent        = fmtPct(arm.margin);
    document.getElementById('modal-arm-caps').textContent =
        (arm.cap_initial || 0) + '/' + (arm.cap_periodic || 0) + '/' + (arm.cap_lifetime || 0);
    document.getElementById('modal-arm-fixed-period').textContent  = (arm.fixed_period_years || 0) + ' yr';

    // First adjustment month → calendar month label (best-effort using today
    // as the loan start date, since we don't persist a start date).
    var firstAdjDate = new Date();
    firstAdjDate.setMonth(firstAdjDate.getMonth() + fixedMonths);
    document.getElementById('modal-arm-first-adj').textContent =
        firstAdjDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    // Terminal rate + amortized P&I for each scenario at the final month of
    // the loan. P&I is the recast payment in force during the loan's last
    // adjustment window — useful as a "worst sustained P&I" indicator.
    var scenarios = [
        { key: 'worst',         rateId: 'modal-arm-rate-worst', piId: 'modal-arm-pi-worst' },
        { key: 'intro_forever', rateId: 'modal-arm-rate-intro', piId: 'modal-arm-pi-intro' },
        { key: 'best',          rateId: 'modal-arm-rate-best',  piId: 'modal-arm-pi-best' }
    ];
    scenarios.forEach(function(sc) {
        var rates = buildRateSchedule(loan, sc.key);
        var terminalRate = rates[rates.length - 1];
        document.getElementById(sc.rateId).textContent = fmtPct(terminalRate);

        // Final-window P&I: re-amortize once at the start of the last
        // adjustment window using the schedule from V2 (cheap; one full pass).
        var amort = calculateAmortizationV2(loan, sc.key, new Date(), []);
        var finalSeries = amort.monthlyPaymentSeries || [];
        var finalPi = finalSeries.length ? finalSeries[finalSeries.length - 1] : loan.pi;
        document.getElementById(sc.piId).textContent = fmtCurrency(finalPi);
    });
}

function openLoanModal(id) {
    var loans = loadLoans();
    var loan = loans.find(function(l) { return l.id === id; });
    if (!loan) return;

    document.getElementById('modal-loan-name').textContent     = loan.name;
    document.getElementById('modal-loan-amount').textContent   = fmtCurrency(loan.loan_amount);
    document.getElementById('modal-interest').textContent      = fmtPct(loan.interest);
    document.getElementById('modal-term').textContent          = (loan.term_years || '—') + ' yr';
    document.getElementById('modal-pi').textContent            = fmtCurrency(loan.pi);
    document.getElementById('modal-monthly-total').textContent = fmtCurrency(loan.monthly_total);
    document.getElementById('modal-points').textContent        = loan.points ? loan.points.toFixed(3) + ' pts' : '—';
    document.getElementById('modal-net-credits').textContent   = fmtCurrency(loan.net_credits);
    document.getElementById('modal-net-fees').textContent      = fmtCurrency(loan.net_fees);
    document.getElementById('modal-closing').textContent       = fmtCurrency(loan.closing);
    document.getElementById('modal-prop-tax').textContent      = fmtCurrency(loan.prop_tax);
    document.getElementById('modal-hoa').textContent           = fmtCurrency(loan.hoa);
    document.getElementById('modal-insurance').textContent     = fmtCurrency(loan.insurance);

    renderArmDetailSection(loan);

    var monthly = loan.monthly_total || 0;
    var show = (loan.loan_amount > 0);
    setPreviewVal('preview_pi',      show, loan.pi);
    setPreviewVal('preview_monthly', show, monthly);
    setPreviewVal('preview_closing', show, loan.closing);
    setPreviewVal('preview_1yr',     show, monthly * 12);
    setPreviewVal('preview_3yr',     show, monthly * 36);
    setPreviewVal('preview_5yr',     show, monthly * 60);
    renderArmPreview(loan);

    var modal = document.getElementById('loan-detail-modal');
    var panel = document.getElementById('preview-panel');
    var backdrop = modal.querySelector('.modal-backdrop');
    modal.insertBefore(panel, backdrop);
    panel.style.display = '';
    panel.style.bottom = '5rem';
    panel.style.right  = '1.5rem';
    panel.style.top    = 'auto';
    panel.style.left   = 'auto';

    modal.showModal();
}

document.getElementById('loan-detail-modal').addEventListener('close', function() {
    var modal = document.getElementById('loan-detail-modal');
    var panel = document.getElementById('preview-panel');
    modal.parentNode.insertBefore(panel, modal);
    panel.style.display = 'none';
});

// Floating preview panel: drag + toggle. Starts hidden; opened by
// openLoanModal() above (or by other page logic) when needed.
(function() {
    var panel   = document.getElementById('preview-panel');
    panel.style.display = 'none';
    var header  = document.getElementById('preview-panel-header');
    var body    = document.getElementById('preview-panel-body');
    var chevron = document.getElementById('preview-chevron');
    var toggle  = document.getElementById('preview-panel-toggle');
    var dragging = false, ox, oy;

    toggle.addEventListener('click', function() {
        var collapsed = body.style.display === 'none';
        body.style.display = collapsed ? '' : 'none';
        chevron.style.transform = collapsed ? '' : 'rotate(-90deg)';
        toggle.title = collapsed ? 'Minimize' : 'Expand';
    });

    header.addEventListener('mousedown', function(e) {
        if (e.target.closest('button')) return;
        dragging = true;
        var r = panel.getBoundingClientRect();
        panel.style.top    = r.top  + 'px';
        panel.style.left   = r.left + 'px';
        panel.style.bottom = 'auto';
        panel.style.right  = 'auto';
        ox = e.clientX - r.left;
        oy = e.clientY - r.top;
        header.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        var x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - panel.offsetWidth));
        var y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - panel.offsetHeight));
        panel.style.left = x + 'px';
        panel.style.top  = y + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (!dragging) return;
        dragging = false;
        header.style.cursor = 'grab';
    });
})();
