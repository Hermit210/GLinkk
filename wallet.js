// wallet.js - Professional Solana Wallet Selector with Delayed Detection
const SOLANA_WALLETS = [
  {
    name: 'Phantom',
    url: 'https://phantom.app/download',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg',
    detect: () => {
      return window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null)
    }
  },
  {
    name: 'Solflare',
    url: 'https://solflare.com',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg',
    detect: () => window.solflare?.isSolflare ? window.solflare : null
  },
  {
    name: 'Backpack',
    url: 'https://backpack.app',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg',
    detect: () => window.backpack?.solana || null
  },
  {
    name: 'OKX Wallet',
    url: 'https://okx.com/web3',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/okx.svg',
    detect: () => window.okxwallet?.solana || null
  },
  {
    name: 'MetaMask',
    url: 'https://metamask.io',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
    detect: () => window.ethereum?.isMetaMask ? window.ethereum : null
  },
  {
    name: 'Coinbase Wallet',
    url: 'https://www.coinbase.com/wallet',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/coinbase.svg',
    detect: () => window.coinbaseSolana || window.coinbaseWalletExtension || null
  }
]

// Wait for wallets to load
window.addEventListener('load', () => {
  setTimeout(() => {
    console.log('Wallets detected:', SOLANA_WALLETS.filter(w => w.detect()).map(w => w.name))
  }, 1000)
})

window.showWalletModal = function() {
  if (document.getElementById('glinkWalletModal')) return
  
  // Wait a bit for wallet extensions to load
  setTimeout(() => {
    const modal = document.createElement('div')
    modal.id = 'glinkWalletModal'
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:Arial,sans-serif'
    
    const box = document.createElement('div')
    box.style.cssText = 'background:#18181b;border-radius:16px;padding:24px;width:360px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,0.5)'
    
    const walletsHTML = SOLANA_WALLETS.map(w => {
      const detected = w.detect() !== null
      return `<button onclick="window.selectSolanaWallet('${w.name}')"
        style="width:100%;padding:14px 16px;margin-bottom:8px;background:${detected ? '#27272a' : '#1c1c1f'};border:1px solid ${detected ? '#3f3f46' : '#27272a'};border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between"
        onmouseover="this.style.borderColor='#9945FF'"
        onmouseout="this.style.borderColor='${detected ? '#3f3f46' : '#27272a'}';this.style.transform='translateY(0)'"
        onmousedown="this.style.transform='translateY(1px)'"
        onmouseup="this.style.transform='translateY(0)'">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="${w.icon}" width="36" height="36"
            style="border-radius:8px"
            onerror="this.style.display='none'">
          <span style="color:#fff;font-size:15px;font-weight:500">${w.name}</span>
        </div>
        <span style="font-size:12px;font-weight:600;color:${detected ? '#14F195' : '#71717a'}">
          ${detected ? 'Detected' : 'Not installed'}
        </span>
      </button>`
    }).join('')
    
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
        <div>
          <h3 style="color:#fff;font-size:18px;margin:0 0 4px 0">Connect a wallet on</h3>
          <h3 style="color:#fff;font-size:18px;margin:0">Solana to continue</h3>
        </div>
        <button onclick="window.closeWalletModal()"
          style="background:#27272a;border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">
          ✕
        </button>
      </div>
      ${walletsHTML}
      <p style="color:#52525b;font-size:11px;text-align:center;margin-top:12px">
        Powered by Oro GRAIL | Solana Blockchain
      </p>
    `
    
    modal.appendChild(box)
    document.body.appendChild(modal)
    
    modal.addEventListener('click', e => {
      if (e.target === modal) window.closeWalletModal()
    })
  }, 100)
}

window.closeWalletModal = function() {
  const m = document.getElementById('glinkWalletModal')
  if (m) m.remove()
}

window.selectSolanaWallet = async function(walletName) {
  const wallet = SOLANA_WALLETS.find(w => w.name === walletName)
  if (!wallet) return
  
  const provider = wallet.detect()
  
  if (!provider) {
    window.closeWalletModal()
    if (confirm(walletName + ' not installed. Install now?')) {
      window.open(wallet.url, '_blank')
    }
    return
  }
  
  window.closeWalletModal()
  
  try {
    if (window.glinkShowMsg) window.glinkShowMsg('Connecting to ' + walletName + '...', 'info')
    
    const response = await provider.connect()
    const walletAddress = response.publicKey.toString()
    
    if (window.glinkShowMsg) window.glinkShowMsg('Connected! ' + walletAddress.slice(0,8) + '...', 'ok')
    
    // Check if this is for transaction signing (callback exists) or login
    if (window.onWalletConnected && typeof window.onWalletConnected === 'function') {
      // Transaction signing mode - call the callback
      window.onWalletConnected(walletAddress, walletName, provider)
      return
    }
    
    // Login mode - authenticate with backend
    const res = await fetch('/api/auth/wallet-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, walletName })
    })
    
    const data = await res.json()
    
    if (data.success) {
      localStorage.setItem('glink_user', JSON.stringify(data.user))
      localStorage.setItem('glink_wallet', walletAddress)
      localStorage.setItem('glink_wallet_name', walletName)
      
      if (window.glinkShowMsg) window.glinkShowMsg('Welcome! Redirecting...', 'ok')
      setTimeout(() => window.location.href = 'dashboard.html', 1500)
    } else {
      if (window.glinkShowMsg) window.glinkShowMsg(data.error || 'Failed', 'err')
    }
  } catch(e) {
    const msg = e.code === 4001 ? 'Connection rejected by user' :
                e.code === -32002 ? 'Wallet popup already open! Check extension' :
                'Error: ' + e.message
    
    if (window.glinkShowMsg) window.glinkShowMsg(msg, 'err')
  }
}

// Auto-detect and show detected wallets count
window.getDetectedWalletsCount = function() {
  return SOLANA_WALLETS.filter(w => w.detect() !== null).length
}

// Transaction signing function for Solana
window.signTransaction = async function(provider, message) {
  if (!provider) throw new Error('Wallet not connected')
  
  // Create a simple message signing request
  const encodedMessage = new TextEncoder().encode(message)
  
  try {
    // Sign message to prove wallet ownership
    const signedMessage = await provider.signMessage(encodedMessage, 'utf8')
    return {
      success: true,
      signature: Array.from(signedMessage.signature).map(b => b.toString(16).padStart(2, '0')).join(''),
      publicKey: signedMessage.publicKey?.toString() || provider.publicKey?.toString()
    }
  } catch(e) {
    throw new Error('Transaction rejected: ' + e.message)
  }
}

console.log('G-Link Wallet Selector loaded with delayed detection.')