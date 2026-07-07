const reasons = [
  "Highest recent return",
  "Most consistent returns",
  "Recovering after poor performance",
  "Gut feeling",
  "Random choice",
  "Other"
];

const state = {
  data: null,
  balance: 100000,
  currentYearIndex: 0,
  selectedFundIndex: null,
  selectedReasonIndex: null,
  decisions: [],
  complete: false
};

const elements = {
  yearLabel: document.getElementById("yearLabel"),
  currentFundLabel: document.getElementById("currentFundLabel"),
  balanceLabel: document.getElementById("balanceLabel"),
  returnsTable: document.getElementById("returnsTable"),
  fundButtons: document.getElementById("fundButtons"),
  reasonButtons: document.getElementById("reasonButtons"),
  continueButton: document.getElementById("continueButton"),
  summaryPanel: document.getElementById("summaryPanel")
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function validateGameData(rawData) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    throw new Error("data.json must contain an object with 'funds' and 'years' properties.");
  }

  if (!Array.isArray(rawData.funds) || !Array.isArray(rawData.years)) {
    throw new Error("data.json must contain arrays named 'funds' and 'years'.");
  }

  if (rawData.funds.length === 0) {
    throw new Error("data.json has no funds defined.");
  }

  if (rawData.years.length === 0) {
    throw new Error("data.json has no yearly return data defined.");
  }

  const funds = rawData.funds.map((fund, index) => {
    if (!fund || typeof fund !== "object") {
      throw new Error(`Fund at index ${index} must be an object.`);
    }

    if (typeof fund.name !== "string" || fund.name.trim() === "") {
      throw new Error(`Fund at index ${index} is missing a valid name.`);
    }

    if (typeof fund.provider !== "string" || fund.provider.trim() === "") {
      throw new Error(`Fund '${fund.name}' is missing a valid provider.`);
    }

    return { name: fund.name, provider: fund.provider };
  });

  const years = rawData.years.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Year entry at index ${index} must be an object.`);
    }

    if (typeof entry.year !== "number") {
      throw new Error(`Year entry at index ${index} is missing a valid year.`);
    }

    if (!Array.isArray(entry.returns)) {
      throw new Error(`Year '${entry.year}' is missing a returns array.`);
    }

    if (entry.returns.length !== funds.length) {
      throw new Error(`Year '${entry.year}' has ${entry.returns.length} returns, but ${funds.length} funds were expected.`);
    }

    return {
      year: entry.year,
      returns: entry.returns.map((value) => Number(value))
    };
  });

  return { funds, years };
}

function loadData() {
  return fetch("data.json", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load data.json (${response.status} ${response.statusText}).`);
      }

      const rawData = await response.json();
      return validateGameData(rawData);
    })
    .catch((error) => {
      console.error("KiwiSaver Challenge could not load data.json.", error);
      throw error;
    });
}

function init() {
  loadData()
    .then((data) => {
      state.data = data;
      render();
    })
    .catch(() => {
      elements.yearLabel.textContent = "Data unavailable";
      elements.currentFundLabel.textContent = "Unavailable";
      elements.balanceLabel.textContent = formatCurrency(state.balance);
      elements.returnsTable.innerHTML = "<p>Unable to load data.json. Check the browser console for details.</p>";
      elements.fundButtons.innerHTML = "";
      elements.reasonButtons.innerHTML = "";
      elements.continueButton.disabled = true;
      elements.summaryPanel.classList.add("hidden");
    });
}

function render() {
  if (!state.data) return;

  const currentYear = state.currentYearIndex < state.data.years.length
    ? state.data.years[state.currentYearIndex]
    : state.data.years[state.data.years.length - 1];
  elements.yearLabel.textContent = state.complete ? `Complete (${currentYear.year})` : currentYear.year;
  elements.currentFundLabel.textContent = state.selectedFundIndex === null
    ? "Not selected"
    : state.data.funds[state.selectedFundIndex].name;
  elements.balanceLabel.textContent = formatCurrency(state.balance);

  renderReturnsTable();
  renderFundButtons();
  renderReasonButtons();
  renderSummary();
  elements.continueButton.disabled = state.complete || state.selectedFundIndex === null || state.selectedReasonIndex === null;
}

function renderReturnsTable() {
  const years = state.data.years.slice(0, state.currentYearIndex);
  let html = "<table><thead><tr><th>Fund</th>";

  years.forEach((entry) => {
    html += `<th>${entry.year}</th>`;
  });

  html += "</tr></thead><tbody>";

  state.data.funds.forEach((fund, fundIndex) => {
    html += `<tr><td><strong>${fund.name}</strong></td>`;
    years.forEach((entry) => {
      const value = entry.returns[fundIndex];
      const className = value >= 0 ? "positive" : "negative";
      html += `<td class="${className}">${value}%</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  elements.returnsTable.innerHTML = html;
}

function renderFundButtons() {
  if (state.complete) {
    elements.fundButtons.innerHTML = "";
    return;
  }

  let html = "";
  const previousFundIndex = state.decisions.length > 0
    ? state.decisions[state.decisions.length - 1].fundIndex
    : null;

  if (state.currentYearIndex > 0) {
    const previousFund = state.data.funds[previousFundIndex];
    const isSelected = state.selectedFundIndex === previousFundIndex;
    html += `<button class="option-button ${isSelected ? "selected" : ""}" data-fund="${previousFundIndex}">Stay invested in ${previousFund.name}</button>`;
  }

  state.data.funds.forEach((fund, fundIndex) => {
    if (state.currentYearIndex > 0 && fundIndex === previousFundIndex) {
      return;
    }

    const isSelected = state.selectedFundIndex === fundIndex;
    const label = state.currentYearIndex > 0 ? `Switch to ${fund.name}` : fund.name;
    html += `<button class="option-button ${isSelected ? "selected" : ""}" data-fund="${fundIndex}">${label}</button>`;
  });

  elements.fundButtons.innerHTML = html;
}

function renderReasonButtons() {
  if (state.complete) {
    elements.reasonButtons.innerHTML = "";
    return;
  }

  const html = reasons.map((reason, index) => {
    const selected = state.selectedReasonIndex === index ? "selected" : "";
    return `<button class="option-button ${selected}" data-reason="${index}">${reason}</button>`;
  }).join("");

  elements.reasonButtons.innerHTML = html;
}

function renderSummary() {
  if (!state.complete) {
    elements.summaryPanel.classList.add("hidden");
    return;
  }

  const finalBalance = state.balance;
  const summaryItems = state.decisions.map((decision) => {
    return `
      <div class="summary-item">
        <strong>${decision.year} — ${decision.fundName} (${decision.provider})</strong>
        <span>${decision.action}</span><br />
        <span>Return: ${decision.annualReturn}% • Balance: ${formatCurrency(decision.closingBalance)}</span>
      </div>
    `;
  }).join("");

  elements.summaryPanel.classList.remove("hidden");
  elements.summaryPanel.innerHTML = `
    <h2>Challenge complete</h2>
    <p>You started with <strong>${formatCurrency(100000)}</strong> and made no additional contributions.</p>
    <p>Your final balance is <strong>${formatCurrency(finalBalance)}</strong>.</p>
    <div class="summary-list">${summaryItems}</div>
  `;
}

function handleFundSelection(event) {
  const button = event.target.closest("button[data-fund]");
  if (!button) return;

  state.selectedFundIndex = Number(button.dataset.fund);
  render();
}

function handleReasonSelection(event) {
  const button = event.target.closest("button[data-reason]");
  if (!button) return;

  state.selectedReasonIndex = Number(button.dataset.reason);
  render();
}

function advanceChallenge() {
  if (state.complete) return;
  if (state.selectedFundIndex === null) {
    alert("Please choose a fund for this year.");
    return;
  }

  if (state.selectedReasonIndex === null) {
    alert("Please tell us why you chose that fund.");
    return;
  }

  const currentYear = state.data.years[state.currentYearIndex];
  const openingBalance = state.balance;
  const annualReturn = currentYear.returns[state.selectedFundIndex];
  const closingBalance = openingBalance * (1 + annualReturn / 100);
  const selectedFund = state.data.funds[state.selectedFundIndex];
  const previousFundIndex = state.decisions.length > 0
    ? state.decisions[state.decisions.length - 1].fundIndex
    : null;
  const action = state.currentYearIndex === 0
    ? "Selected fund"
    : state.selectedFundIndex === previousFundIndex
      ? "Stayed invested"
      : "Switched funds";

  state.balance = closingBalance;
  state.decisions.push({
    year: currentYear.year,
    fundIndex: state.selectedFundIndex,
    fundName: selectedFund.name,
    provider: selectedFund.provider,
    reason: reasons[state.selectedReasonIndex],
    annualReturn,
    openingBalance,
    closingBalance,
    action
  });

  state.currentYearIndex += 1;
  state.selectedReasonIndex = null;

  if (state.currentYearIndex >= state.data.years.length) {
    state.complete = true;
    render();
    return;
  }

  state.selectedFundIndex = state.decisions[state.decisions.length - 1].fundIndex;
  render();
}

elements.fundButtons.addEventListener("click", handleFundSelection);
elements.reasonButtons.addEventListener("click", handleReasonSelection);
elements.continueButton.addEventListener("click", advanceChallenge);

init();
