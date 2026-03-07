// G-Link - Shared application logic

// Storage key for demo data
const STORAGE_KEY = 'glink_demo_data';

// Get or create demo storage
function getStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : { goldLinks: [], registries: [] };
  } catch {
    return { goldLinks: [], registries: [] };
  }
}

function setStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Create Wedding Registry
document.querySelectorAll('#createRegistryBtn, #heroRegistry').forEach(btn => {
  btn?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'wedding-registry.html';
  });
});
