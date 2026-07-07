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
  summaryPanel: document.getElementById("summaryPanel"),
  yearTransitionOverlay: document.getElementById("yearTransitionOverlay"),
  transitionFromYear: document.getElementById("transitionFromYear"),
  transitionToYear: document.getElementById("transitionToYear"),
  transitionBalance: document.getElementById("transitionBalance")
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

function getMostFrequentSelection(items, selector) {
  const counts = new Map();
  let bestKey = null;
  let bestCount = 0;

  items.forEach((item) => {
    const key = selector(item);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);

    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  });

  return { key: bestKey, count: bestCount };
}

function calculateBuyAndHoldBalance(fundIndex) {
  return state.data.years.reduce((balance, entry) => {
    return balance * (1 + entry.returns[fundIndex] / 100);
  }, 100000);
}

function calculateBestPossibleOutcome() {
  return state.data.years.reduce((balance, entry) => {
    const bestReturn = Math.max(...entry.returns);
    return balance * (1 + bestReturn / 100);
  }, 100000);
}

function calculateWorstPossibleOutcome() {
  return state.data.years.reduce((balance, entry) => {
    const worstReturn = Math.min(...entry.returns);
    return balance * (1 + worstReturn / 100);
  }, 100000);
}

function getBuyAndHoldResults() {
  return state.data.funds.map((fund, index) => ({
    fundIndex: index,
    fundName: fund.provider,
    balance: calculateBuyAndHoldBalance(index)
  })).sort((a, b) => b.balance - a.balance);
}

function getParticipantInvestmentInsights() {
  const decisions = state.decisions;
  const years = decisions.length;
  const switchCount = decisions.filter((decision) => decision.action === "Switched funds").length;
  const stayedCount = years - switchCount;
  const mostFrequentFundCount = getMostFrequentSelection(decisions, (decision) => decision.fundIndex).count;
  const insights = [];
  let topPreviousCount = 0;
  let bottomPreviousCount = 0;
  let stayedAfterLossCount = 0;
  let switchedAfterLossCount = 0;
  let switchedAfterStrongCount = 0;

  for (let index = 1; index < decisions.length; index += 1) {
    const previousYear = state.data.years[index - 1];
    const decision = decisions[index];
    const chosenPreviousReturn = previousYear.returns[decision.fundIndex];
    const bestPreviousReturn = Math.max(...previousYear.returns);
    const worstPreviousReturn = Math.min(...previousYear.returns);
    const switched = decision.action === "Switched funds";

    if (chosenPreviousReturn === bestPreviousReturn) {
      topPreviousCount += 1;
    }

    if (chosenPreviousReturn === worstPreviousReturn) {
      bottomPreviousCount += 1;
    }

    if (previousYear.returns[decisions[index - 1].fundIndex] < 0) {
      if (switched) {
        switchedAfterLossCount += 1;
      } else {
        stayedAfterLossCount += 1;
      }
    }

    if (chosenPreviousReturn >= 8 && switched) {
      switchedAfterStrongCount += 1;
    }
  }

  if (switchCount > years * 0.6) {
    insights.push("You switched funds frequently, reflecting an active decision-making style.");
  } else if (stayedCount >= years * 0.8) {
    insights.push("You stayed invested most years, which is consistent with a long-term approach.");
  } else {
    insights.push("You balanced switching with staying invested, showing a mixed strategic style.");
  }

  if (mostFrequentFundCount >= Math.ceil(years * 0.7)) {
    insights.push("You demonstrated a strong preference for one core fund.");
  }

  if (topPreviousCount >= Math.ceil((years - 1) * 0.55)) {
    insights.push("You often chose funds that were recent top performers.");
  }

  if (bottomPreviousCount >= Math.ceil((years - 1) * 0.33)) {
    insights.push("Some choices followed lower-performing funds, which may indicate chasing recent returns.");
  }

  if (stayedAfterLossCount >= 2) {
    insights.push("You demonstrated patience by staying invested through multiple downturns.");
  }

  if (switchedAfterLossCount >= 2) {
    insights.push("You frequently reacted to losses by changing funds.");
  }

  if (insights.length > 6) {
    return insights.slice(0, 6);
  }

  return insights;
}

function getPerformanceRating(actualBalance, bestBalance, buyHoldResults) {
  const buyHoldBalances = buyHoldResults.map((result) => result.balance);
  const betterCount = buyHoldBalances.filter((balance) => balance > actualBalance).length;
  const rank = betterCount + 1;
  const score = actualBalance / bestBalance;
  let label = "Needs Improvement";
  let stars = "★★☆☆☆";

  if (score >= 0.85 && rank <= 3) {
    label = "Excellent";
    stars = "★★★★★";
  } else if (score >= 0.7 || rank <= 4) {
    label = "Good";
    stars = "★★★★☆";
  } else if (score >= 0.5 || rank <= 7) {
    label = "Average";
    stars = "★★★☆☆";
  }

  return {
    stars,
    label,
    rank,
    totalFunds: buyHoldResults.length,
    score
  };
}

function getPerformanceTakeaway(performance) {
  if (performance.label === "Excellent") {
    return `Strong outcome: your portfolio finished in the top ${performance.rank} of ${performance.totalFunds} buy-and-hold strategies.`;
  }

  if (performance.label === "Good") {
    return `A solid result: your decisions delivered good relative performance against most buy-and-hold strategies.`;
  }

  if (performance.label === "Average") {
    return `A moderate outcome: you were close to the middle of the pack, with room to simplify toward a stable buy-and-hold approach.`;
  }

  return `Your result trailed most buy-and-hold strategies, suggesting a more patient, long-term approach may have improved outcomes.`;
}

function renderSummary() {
  if (!state.complete) {
    elements.summaryPanel.classList.add("hidden");
    return;
  }

  const finalBalance = state.balance;
  const fundFrequency = getMostFrequentSelection(state.decisions, (decision) => decision.fundIndex);
  const reasonFrequency = getMostFrequentSelection(state.decisions, (decision) => decision.reason);
  const bestBalance = calculateBestPossibleOutcome();
  const worstBalance = calculateWorstPossibleOutcome();
  const stayInvestedFundIndex = fundFrequency.key;
  const stayInvestedFund = state.data.funds[stayInvestedFundIndex];
  const stayInvestedBalance = calculateBuyAndHoldBalance(stayInvestedFundIndex);
  const stayInvestedFundName = stayInvestedFund.provider;
  const buyHoldResults = getBuyAndHoldResults();
  const actualRank = buyHoldResults.filter((result) => result.balance > finalBalance).length + 1;
  const performance = getPerformanceRating(finalBalance, bestBalance, buyHoldResults);
  const performanceTakeaway = getPerformanceTakeaway(performance);
  const insights = getParticipantInvestmentInsights();

  elements.summaryPanel.classList.remove("hidden");
  elements.summaryPanel.innerHTML = `
    <div class="advisor-summary">
      <div class="summary-top">
        <div class="summary-title">
          <h2>Your Investment Behaviour Summary</h2>
          <p>A professional review of your KiwiSaver decisions, comparing your results to alternative strategies.</p>
        </div>
        <div>
          <div class="rating-block">
            <div class="rating-stars" aria-hidden="true">${performance.stars}</div>
            <div class="rating-label">${performance.label}</div>
            <div class="rating-note">Ranked ${performance.rank} of ${performance.totalFunds} buy-and-hold strategies</div>
          </div>
          <div class="takeaway-block">${performanceTakeaway}</div>
        </div>
      </div>

      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-card-icon">📊</div>
          <div class="summary-card-label">Your Final Balance</div>
          <div class="summary-card-value">${formatCurrency(finalBalance)}</div>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">🏦</div>
          <div class="summary-card-label">Most Frequently Chosen Fund</div>
          <div class="summary-card-value">${state.data.funds[fundFrequency.key].provider}</div>
          <div class="summary-card-meta">Chosen ${fundFrequency.count} of ${state.decisions.length} years</div>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">🧠</div>
          <div class="summary-card-label">Most Common Reason</div>
          <div class="summary-card-value">${reasonFrequency.key}</div>
          <div class="summary-card-meta">Chosen ${reasonFrequency.count} times</div>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">🌟</div>
          <div class="summary-card-label">Best Possible Outcome</div>
          <div class="summary-card-value">${formatCurrency(bestBalance)}</div>
          <div class="summary-card-meta">Perfect hindsight</div>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">⚠️</div>
          <div class="summary-card-label">Worst Possible Outcome</div>
          <div class="summary-card-value">${formatCurrency(worstBalance)}</div>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">🔒</div>
          <div class="summary-card-label">Stayed Invested In</div>
          <div class="summary-card-value">${stayInvestedFundName}</div>
          <div class="summary-card-meta">Final balance: ${formatCurrency(stayInvestedBalance)}</div>
        </div>
      </div>

      <div class="summary-section">
        <div class="section-heading">Buy-and-Hold Comparison</div>
        <div class="buy-hold-table-wrap">
          <table class="buy-hold-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Fund</th>
                <th>Final Balance</th>
              </tr>
            </thead>
            <tbody>
              ${buyHoldResults.map((result, index) => `
                <tr class="${result.balance === Math.max(...buyHoldResults.map((r) => r.balance)) ? "highlight" : ""}">
                  <td>${index + 1}</td>
                  <td>${result.fundName}</td>
                  <td>${formatCurrency(result.balance)}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr class="actual-result">
                <td>${actualRank}</td>
                <td>Your actual result</td>
                <td>${formatCurrency(finalBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="summary-note">Your actual result sits at rank ${actualRank} compared to buy-and-hold strategies.</div>
      </div>

      <div class="summary-section">
        <div class="section-heading">Behavioural Insights</div>
        <ul class="insights-list">
          ${insights.map((insight) => `<li>${insight}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

function generateBalanceSteps(openingBalance, closingBalance) {
  const stepCount = 11;
  const values = [];
  const diff = closingBalance - openingBalance;
  const direction = Math.sign(diff) || 1;

  for (let index = 1; index < stepCount; index += 1) {
    const progress = index / stepCount;
    const base = openingBalance + diff * progress;
    const volatility = Math.abs(diff) * 0.28 * (1 - progress);
    const noise = (Math.random() * 2 - 1) * volatility;
    values.push(base + noise);
  }

  values.push(closingBalance);
  return values.map((value, index) => index === values.length - 1 ? closingBalance : Math.max(0, value));
}

function setTransitionBalanceText(value) {
  elements.transitionBalance.textContent = formatCurrency(value);
}

function showYearTransition(fromYear, toYear, openingBalance, closingBalance, annualReturn, callback) {
  const isPositive = annualReturn >= 0;
  const balanceSteps = generateBalanceSteps(openingBalance, closingBalance);

  elements.transitionFromYear.textContent = `Year ${fromYear}`;
  elements.transitionToYear.textContent = toYear === null ? "Complete" : `Year ${toYear}`;
  elements.transitionBalance.classList.remove("upward", "downward");
  elements.transitionBalance.classList.add(isPositive ? "upward" : "downward");
  setTransitionBalanceText(openingBalance);

  elements.yearTransitionOverlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    elements.yearTransitionOverlay.classList.add("visible");
  });

  let stepIndex = 0;
  const interval = 150;

  const animationTimer = setInterval(() => {
    setTransitionBalanceText(balanceSteps[stepIndex]);
    stepIndex += 1;

    if (stepIndex >= balanceSteps.length) {
      clearInterval(animationTimer);
      setTransitionBalanceText(closingBalance);
      setTimeout(() => {
        elements.yearTransitionOverlay.classList.remove("visible");
        elements.yearTransitionOverlay.addEventListener("transitionend", function handleHide() {
          elements.yearTransitionOverlay.classList.add("hidden");
          elements.yearTransitionOverlay.removeEventListener("transitionend", handleHide);
          callback();
        }, { once: true });
      }, 260);
    }
  }, interval);
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

  elements.continueButton.disabled = true;
  elements.fundButtons.querySelectorAll("button").forEach((button) => button.disabled = true);
  elements.reasonButtons.querySelectorAll("button").forEach((button) => button.disabled = true);

  showYearTransition(
    currentYear.year,
    state.currentYearIndex + 1 < state.data.years.length ? state.data.years[state.currentYearIndex + 1].year : null,
    openingBalance,
    closingBalance,
    annualReturn,
    () => {
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
      } else {
        state.selectedFundIndex = state.decisions[state.decisions.length - 1].fundIndex;
      }

      render();
    }
  );
}

elements.fundButtons.addEventListener("click", handleFundSelection);
elements.reasonButtons.addEventListener("click", handleReasonSelection);
elements.continueButton.addEventListener("click", advanceChallenge);

init();
