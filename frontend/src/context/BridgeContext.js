import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { ethers } from "ethers";
import { getNetworkConfig, isSupportedNetwork } from "../utils/contracts";

const BridgeContext = createContext();

export function useBridge() {
  return useContext(BridgeContext);
}

export function BridgeProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [history, setHistory] = useState([]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }
    try {
      const _provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await _provider.send("eth_requestAccounts", []);
      const _signer = _provider.getSigner();
      const network = await _provider.getNetwork();

      setProvider(_provider);
      setSigner(_signer);
      setAccount(accounts[0]);
      setChainId(network.chainId);
    } catch (err) {
      console.error("Connection failed:", err);
    }
  }, []);

  // Switch network
  const switchNetwork = useCallback(async (targetChainIdHex) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (err) {
      // If chain not added, add it
      if (err.code === 4902) {
        const netConfig =
          targetChainIdHex === "0xaa36a7"
            ? {
                chainId: "0xaa36a7",
                chainName: "Sepolia",
                rpcUrls: ["https://rpc.sepolia.org"],
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              }
            : {
                chainId: "0x13882",
                chainName: "Polygon Amoy",
                rpcUrls: ["https://rpc-amoy.polygon.technology"],
                nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
                blockExplorerUrls: ["https://amoy.polygonscan.com"],
              };
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [netConfig],
        });
      } else {
        console.error("Switch failed:", err);
      }
    }
  }, []);

  // Add to history
  const addHistory = useCallback((entry) => {
    setHistory((prev) => [entry, ...prev]);
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleChainChanged = (hexChainId) => {
      const newChainId = parseInt(hexChainId, 16);
      // Rebuild provider + signer for the NEW chain, then set chainId last
      // so downstream consumers see a consistent (provider, signer, chainId) tuple
      const _provider = new ethers.providers.Web3Provider(window.ethereum);
      const _signer = _provider.getSigner();
      setProvider(_provider);
      setSigner(_signer);
      setChainId(newChainId);
    };

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        setAccount(null);
        setSigner(null);
        return;
      }
      setAccount(accounts[0]);
      // Rebuild provider+signer so balance reads use the new account
      const _provider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(_provider);
      setSigner(_provider.getSigner());
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const networkConfig = chainId ? getNetworkConfig(chainId) : null;
  const isSupported = chainId ? isSupportedNetwork(chainId) : false;

  return (
    <BridgeContext.Provider
      value={{
        account,
        chainId,
        provider,
        signer,
        networkConfig,
        isSupported,
        history,
        connectWallet,
        switchNetwork,
        addHistory,
      }}
    >
      {children}
    </BridgeContext.Provider>
  );
}
