/*
 * SubTrack – Subscription Manager
 *
 * This script handles all client-side logic for managing subscription data.
 * Data is persisted locally using the browser's localStorage API.
 */

// Utility functions for date computations

/**
 * Parse a date string (YYYY-MM-DD) and return a Date object.
 * @param {string} dateStr
 * @returns {Date}
 */
function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00'); // ensure UTC baseline
}

/**
 * Format a Date object as YYYY-MM-DD for input fields.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add one billing period to a date based on frequency.
 * @param {Date} date
 * @param {string} frequency
 * @returns {Date}
 */
function addPeriod(date, frequency) {
  const newDate = new Date(date.getTime());
  switch (frequency) {
    case 'monthly':
      newDate.setMonth(newDate.getMonth() + 1);
      break;
    case 'yearly':
      newDate.setFullYear(newDate.getFullYear() + 1);
      break;
    case 'weekly':
      newDate.setDate(newDate.getDate() + 7);
      break;
    case 'daily':
      newDate.setDate(newDate.getDate() + 1);
      break;
    default:
      newDate.setMonth(newDate.getMonth() + 1);
  }
  return newDate;
}

/**
 * Compute monthly cost from raw cost and frequency.
 * @param {number} cost
 * @param {string} frequency
 * @returns {number}
 */
function computeMonthlyCost(cost, frequency) {
  switch (frequency) {
    case 'monthly':
      return cost;
    case 'yearly':
      return cost / 12;
    case 'weekly':
      return cost * 52 / 12; // approximate weeks per year / months
    case 'daily':
      return cost * 365 / 12;
    default:
      return cost;
  }
}

/**
 * Compute days left until a date from today.
 * Negative values indicate overdue.
 * @param {Date} date
 * @returns {number}
 */
function computeDaysLeft(date) {
  const now = new Date();
  // reset times to midday to avoid timezone issues
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Data store for subscriptions
let subscriptions = [];
let editingId = null; // id of subscription currently being edited

/**
 * Load subscriptions from localStorage into the in-memory array.
 */
function loadSubscriptions() {
  const data = localStorage.getItem('subscriptions');
  if (data) {
    try {
      subscriptions = JSON.parse(data);
      // Convert date strings back to Date objects for nextDate
      subscriptions.forEach(sub => {
        sub.nextDate = sub.nextDate;
      });
    } catch (e) {
      console.error('Error parsing subscriptions from localStorage', e);
      subscriptions = [];
    }
  }
}

/**
 * Save current subscriptions array to localStorage.
 */
function saveSubscriptions() {
  localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
}

/**
 * Ensure that each subscription's nextDate is in the future. If the next date
 * has passed, increment it by its frequency until it is in the future.
 */
function updateNextDates() {
  const today = new Date();
  subscriptions.forEach(sub => {
    let nextDate = parseDate(sub.nextDate);
    // If due date is in the past or today, increment until future (daysLeft >= 0)
    while (computeDaysLeft(nextDate) < 0) {
      nextDate = addPeriod(nextDate, sub.frequency);
    }
    sub.nextDate = formatDate(nextDate);
  });
  saveSubscriptions();
}

/**
 * Render the subscription table and summary values.
 */
function updateUI() {
  // First ensure next dates are up to date
  updateNextDates();

  const tbody = document.querySelector('#subscriptionTable tbody');
  tbody.innerHTML = '';
  let totalMonthly = 0;
  let totalYearly = 0;
  const now = new Date();
  subscriptions.forEach(sub => {
    const monthlyCost = computeMonthlyCost(Number(sub.cost), sub.frequency);
    totalMonthly += monthlyCost;
    totalYearly += monthlyCost * 12;
    const nextDate = parseDate(sub.nextDate);
    const daysLeft = computeDaysLeft(nextDate);
    // Create row
    const tr = document.createElement('tr');
    if (daysLeft < 0) {
      tr.classList.add('expired');
    } else if (daysLeft <= 3) {
      tr.classList.add('due-soon');
    }
    tr.innerHTML = `
      <td>${sub.name}</td>
      <td>${sub.category}</td>
      <td>$${Number(sub.cost).toFixed(2)}</td>
      <td>${sub.frequency.charAt(0).toUpperCase() + sub.frequency.slice(1)}</td>
      <td>${sub.nextDate}</td>
      <td>$${monthlyCost.toFixed(2)}</td>
      <td>${daysLeft >= 0 ? daysLeft : 'Overdue'}</td>
      <td>
        <button class="action-btn action-edit" data-id="${sub.id}">Edit</button>
        <button class="action-btn action-delete" data-id="${sub.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  // Update summary
  document.getElementById('totalCount').textContent = subscriptions.length;
  document.getElementById('totalMonthly').textContent = '$' + totalMonthly.toFixed(2);
  document.getElementById('totalYearly').textContent = '$' + totalYearly.toFixed(2);
}

/**
 * Add a new subscription or update an existing one.
 * @param {Object} sub
 */
function saveSubscription(sub) {
  if (editingId) {
    // Update existing subscription
    const index = subscriptions.findIndex(s => s.id === editingId);
    if (index > -1) {
      subscriptions[index] = { ...subscriptions[index], ...sub, id: editingId };
    }
    editingId = null;
    // Reset form button text
    document.querySelector('#subscriptionForm button[type="submit"]').textContent = 'Add Subscription';
  } else {
    // Add new
    subscriptions.push(sub);
  }
  saveSubscriptions();
  updateUI();
}

/**
 * Delete subscription by id
 * @param {string} id
 */
function deleteSubscription(id) {
  subscriptions = subscriptions.filter(sub => sub.id !== id);
  saveSubscriptions();
  updateUI();
}

/**
 * Initialize event listeners for form and table actions.
 */
function initEventListeners() {
  const form = document.getElementById('subscriptionForm');
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    const name = document.getElementById('name').value.trim();
    const category = document.getElementById('category').value;
    const cost = parseFloat(document.getElementById('cost').value);
    const frequency = document.getElementById('frequency').value;
    const nextDate = document.getElementById('nextDate').value;
    const notes = document.getElementById('notes').value.trim();
    if (!name || isNaN(cost) || !nextDate) {
      alert('Please fill all required fields.');
      return;
    }
    const sub = {
      id: editingId || Date.now().toString(),
      name,
      category,
      cost,
      frequency,
      nextDate,
      notes
    };
    saveSubscription(sub);
    // Reset form fields
    form.reset();
  });
  // Event delegation for edit/delete buttons
  document.getElementById('subscriptionTable').addEventListener('click', function(event) {
    const target = event.target;
    const id = target.getAttribute('data-id');
    if (target.classList.contains('action-delete')) {
      if (confirm('Delete this subscription?')) {
        deleteSubscription(id);
      }
    } else if (target.classList.contains('action-edit')) {
      // Populate form with subscription data
      const sub = subscriptions.find(s => s.id === id);
      if (sub) {
        document.getElementById('name').value = sub.name;
        document.getElementById('category').value = sub.category;
        document.getElementById('cost').value = sub.cost;
        document.getElementById('frequency').value = sub.frequency;
        document.getElementById('nextDate').value = sub.nextDate;
        document.getElementById('notes').value = sub.notes || '';
        editingId = id;
        document.querySelector('#subscriptionForm button[type="submit"]').textContent = 'Update Subscription';
      }
    }
  });
}

// Initialize app
window.addEventListener('DOMContentLoaded', function() {
  loadSubscriptions();
  updateUI();
  initEventListeners();
});