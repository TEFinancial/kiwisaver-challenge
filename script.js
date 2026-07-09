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
  complete: false,
  sessionRecorded: false
};

const elements = {
  landingPage: document.getElementById("landingPage"),
  startButton: document.getElementById("startButton"),
  appShell: document.querySelector(".app-shell"),
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

const sessionStorageAdapter = {
  storageKey: "kiwisaverChallengeSessions",

  loadSessions() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.warn("Unable to load session storage.", error);
      return [];
    }
  },

  saveSessions(sessions) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(sessions));
    } catch (error) {
      console.warn("Unable to save session storage.", error);
    }
  },

  addSession(session) {
    const sessions = this.loadSessions();
    sessions.push(session);
    this.saveSessions(sessions);
    return sessions;
  }
};

function createSessionId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildSessionRecord() {
  const finalBalance = state.balance;
  const switchCount = state.decisions.filter((decision) => decision.action === "Switched funds").length;
  const mostFrequentFund = getMostFrequentSelection(state.decisions, (decision) => state.data.funds[decision.fundIndex].provider);
  const mostCommonReason = getMostFrequentSelection(state.decisions, (decision) => decision.reason);

  return {
    sessionId: createSessionId(),
    completedAt: new Date().toISOString(),
    finalBalance: Number(finalBalance.toFixed(2)),
    switchCount,
    mostFrequentlySelectedFund: mostFrequentFund.key,
    mostCommonReason: mostCommonReason.key,
    decisionHistory: state.decisions.map((decision) => ({
      year: decision.year,
      selectedFund: state.data.funds[decision.fundIndex].provider,
      reason: decision.reason,
      annualReturn: decision.annualReturn,
      openingBalance: decision.openingBalance,
      closingBalance: decision.closingBalance
    }))
  };
}

function recordCompletedSession() {
  if (state.sessionRecorded) {
    return;
  }

  const record = buildSessionRecord();
  sessionStorageAdapter.addSession(record);
  state.sessionRecorded = true;
}

function getStoredSessions() {
  return sessionStorageAdapter.loadSessions();
}

function calculateAverage(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function countBy(items, selector) {
  const counts = new Map();

  items.forEach((item) => {
    const key = selector(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function getMostCommonValue(items, selector) {
  const counts = countBy(items, selector);
  let mostCommon = null;
  let highestCount = 0;

  counts.forEach((count, key) => {
    if (count > highestCount) {
      highestCount = count;
      mostCommon = key;
    }
  });

  return { key: mostCommon, count: highestCount };
}

function getSessionStatistics() {
  const sessions = getStoredSessions();
  const totalSessions = sessions.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      averageFinalBalance: 0,
      highestFinalBalance: 0,
      lowestFinalBalance: 0,
      averageSwitchCount: 0,
      mostCommonFund: null,
      mostCommonReason: null
    };
  }

  const finalBalances = sessions.map((session) => session.finalBalance);
  const switchCounts = sessions.map((session) => session.switchCount);
  const mostCommonFund = getMostCommonValue(sessions, (session) => session.mostFrequentlySelectedFund);
  const mostCommonReason = getMostCommonValue(sessions, (session) => session.mostCommonReason);

  return {
    totalSessions,
    averageFinalBalance: calculateAverage(finalBalances),
    highestFinalBalance: Math.max(...finalBalances),
    lowestFinalBalance: Math.min(...finalBalances),
    averageSwitchCount: calculateAverage(switchCounts),
    mostCommonFund: mostCommonFund.key,
    mostCommonFundCount: mostCommonFund.count,
    mostCommonReason: mostCommonReason.key,
    mostCommonReasonCount: mostCommonReason.count
  };
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

function calculateInvestorDisciplineScore(actualBalance, switchCount, buyHoldResults, bestBalance) {
  const averageBuyHold = calculateAverage(buyHoldResults.map((result) => result.balance));
  const switchScore = switchCount <= 2 ? 20 : switchCount <= 4 ? 14 : switchCount <= 6 ? 8 : 2;
  const outcomeScore = bestBalance > 0 ? Math.round(Math.min(40, (actualBalance / bestBalance) * 40)) : 20;
  const buyHoldScore = averageBuyHold > 0 ? Math.round(Math.min(25, (actualBalance / averageBuyHold) * 25)) : 20;
  const score = Math.min(100, Math.max(15, switchScore + outcomeScore + buyHoldScore + 10));

  const explanationParts = [
    `This score reflects your decision discipline across ${state.decisions.length} years and ${switchCount} fund switch${switchCount === 1 ? "" : "es"}.`,
    switchCount <= 4 ? "Moderate switching supports a disciplined long-term approach." : "More consistency could strengthen your score.",
    actualBalance >= averageBuyHold
      ? "Your result outperformed the average buy-and-hold strategy."
      : "Your result is below the average buy-and-hold strategy."
  ];

  return {
    score,
    explanation: explanationParts.join(" ")
  };
}

function getParticipantRanking(finalBalance) {
  const sessions = getStoredSessions();
  if (sessions.length <= 1) {
    return null;
  }

  const total = sessions.length;
  const lowerCount = sessions.filter((session) => session.finalBalance < finalBalance).length;
  const percentile = Math.round((lowerCount / total) * 100);

  if (percentile === 100) {
    return "You outperformed 100% of participants.";
  }

  if (percentile >= 85) {
    return `Top ${100 - percentile}% of participants.`;
  }

  return `You outperformed ${percentile}% of participants.`;
}

function generateLinkedInShareText(details) {
  const rankingLine = details.participantRanking ? `Participant ranking: ${details.participantRanking}\n\n` : "";
  return `I just completed the FoxPlan KiwiSaver Challenge.\n\nStarting with ${details.startingBalance}, I attempted to choose between ten anonymous KiwiSaver growth funds using only the information that would have been available at the time.\n\nMy final portfolio value was:\n\n${details.finalBalance}\n\nI switched funds ${details.switchCount} times.\n\nMost frequently selected fund: ${details.mostFrequentFund}.\nMost common decision reason: ${details.mostCommonReason}.\n\nMy Investor Discipline Score was ${details.disciplineScore} / 100.\n\n${rankingLine}Can you beat my result?\n\nTake the challenge:\n\n${details.challengeUrl}\n\n#KiwiSaver #Investing #BehaviouralFinance #FoxPlan`;
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }

  return new Promise((resolve) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      const successful = document.execCommand("copy");
      resolve(successful);
    } catch (error) {
      resolve(false);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}

function renderShareNotice(message, isError = false) {
  const notice = elements.summaryPanel.querySelector("#shareNotice");
  if (!notice) {
    alert(message);
    return;
  }

  notice.textContent = message;
  notice.classList.remove("hidden", "error");
  if (isError) {
    notice.classList.add("error");
  }

  if (notice.dataset.timeoutId) {
    window.clearTimeout(notice.dataset.timeoutId);
  }

  const timeoutId = window.setTimeout(() => {
    notice.classList.add("hidden");
  }, 4500);

  notice.dataset.timeoutId = timeoutId;
}

function handleLinkedInShare() {
  const finalBalance = state.balance;
  const switchCount = state.decisions.filter((decision) => decision.action === "Switched funds").length;
  const mostFrequentFund = getMostFrequentSelection(state.decisions, (decision) => state.data.funds[decision.fundIndex].provider).key;
  const mostCommonReason = getMostFrequentSelection(state.decisions, (decision) => decision.reason).key;
  const buyHoldResults = getBuyAndHoldResults();
  const bestBalance = calculateBestPossibleOutcome();
  const discipline = calculateInvestorDisciplineScore(finalBalance, switchCount, buyHoldResults, bestBalance);
  const participantRanking = getParticipantRanking(finalBalance);

  const summaryText = generateLinkedInShareText({
    startingBalance: formatCurrency(100000),
    finalBalance: formatCurrency(finalBalance),
    switchCount,
    mostFrequentFund,
    mostCommonReason,
    disciplineScore: discipline.score,
    participantRanking,
    challengeUrl: `${window.location.origin}${window.location.pathname}`
  });

  const linkedInTab = window.open("https://www.linkedin.com/feed/", "_blank");

  copyTextToClipboard(summaryText).then((copied) => {
    if (copied) {
      renderShareNotice("Your challenge summary has been copied to your clipboard.");
    } else {
      renderShareNotice("The summary could not be copied automatically. Please paste it manually into LinkedIn.", true);
    }

    if (!linkedInTab || linkedInTab.closed) {
      renderShareNotice("LinkedIn could not be opened automatically. Please open LinkedIn and paste your summary manually.", true);
    }
  });
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
  const switchCount = state.decisions.filter((decision) => decision.action === "Switched funds").length;
  const discipline = calculateInvestorDisciplineScore(finalBalance, switchCount, buyHoldResults, bestBalance);
  const participantRankingText = getParticipantRanking(finalBalance);

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

      <div class="summary-section share-section">
        <div class="share-top">
          <div>
            <div class="section-heading">Challenge Your Network</div>
            <p class="share-subtitle">Think your friends or colleagues can do better? Challenge them to beat your result.</p>
          </div>

          <div class="share-card">
            <div class="share-badge">
              <span>Investor Discipline Score</span>
              <strong>${discipline.score} / 100</strong>
            </div>
            <p class="share-note">${discipline.explanation}</p>
            ${participantRankingText ? `<div class="participant-ranking">${participantRankingText}</div>` : ""}
          </div>
        </div>

        <button id="linkedinShareButton" class="share-button" type="button">
          <span class="linkedin-icon" aria-hidden="true">in</span>
          Challenge your network on LinkedIn
        </button>

        <div id="shareNotice" class="share-notice hidden" role="status" aria-live="polite"></div>
      </div>
    </div>
  `;

  const linkedinButton = elements.summaryPanel.querySelector("#linkedinShareButton");
  if (linkedinButton) {
    linkedinButton.addEventListener("click", handleLinkedInShare);
  }
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
  elements.yearTransitionOverlay.classList.remove("positive-year", "negative-year");
  elements.yearTransitionOverlay.classList.add(isPositive ? "positive-year" : "negative-year");
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
          elements.yearTransitionOverlay.classList.remove("positive-year", "negative-year");
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
        recordCompletedSession();
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
elements.startButton.addEventListener("click", () => {
  elements.landingPage.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  render();
});

init();
