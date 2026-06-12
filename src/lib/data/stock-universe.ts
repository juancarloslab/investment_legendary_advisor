/**
 * 확장된 스크리닝 대상 종목 유니버스
 *
 * S&P 500 핵심 50종목 + 다우존스 30종목 + 나스닥 100 핵심 50종목
 * 중복 제거 후 총 ~130개 종목을 주기적으로 스크리닝합니다.
 */

import type { ScreeningUniverseMeta } from '@/types';

// ─── 확장된 종목 유니버스 ────────────────────────────────────

export const STOCK_UNIVERSE: Record<string, string[]> = {
  // S&P 500 대형 기술주 (시가총액 상위)
  sp500MegaCap: [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'BRK-B', 'WMT',
    'JPM', 'V', 'UNH', 'LLY', 'XOM', 'JNJ', 'PG', 'MA', 'HD', 'CVX'
  ],

  // 다우존스 산업평균지수 30종목
  dowJones: [
    'AAPL', 'AMGN', 'AMZN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'DIS',
    'DOW', 'GS', 'HD', 'HON', 'IBM', 'INTC', 'JNJ', 'JPM', 'KO', 'MCD',
    'MMM', 'MRK', 'MSFT', 'NKE', 'PG', 'TRV', 'UNH', 'V', 'VZ', 'WMT'
  ],

  // 나스닥 100 기술/성장주 (시가총액 상위)
  nasdaq100: [
    'NVDA', 'META', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'AVGO', 'PEP', 'COST',
    'NFLX', 'AMD', 'ADBE', 'CSCO', 'TMUS', 'INTC', 'QCOM', 'INTU', 'AMAT', 'TXN',
    'CMCSA', 'BKNG', 'HON', 'ISRG', 'SBUX', 'AMGN', 'MDLZ', 'GILD', 'ADI', 'ADP',
    'VRTX', 'PANW', 'MU', 'LRCX', 'KLAC', 'REGN', 'SNPS', 'CDNS', 'ASML', 'NXPI',
    'CSX', 'FTNT', 'MRVL', 'CRWD', 'FANG', 'DXCM', 'WDAY', 'ORLY', 'MAR', 'AEP'
  ],

  // 배당 귀족주 (Dividend Aristocrats - 25년+ 연속 배당 인상)
  dividendAristocrats: [
    'JNJ', 'PG', 'KO', 'PEP', 'MCD', 'WMT', 'ABT', 'MMM', 'EMR', 'ITW',
    'CL', 'GPC', 'DOV', 'LOW', 'TGT', 'CAT', 'XOM', 'CVX', 'GD', 'BDX',
    'APD', 'O', 'KMB', 'SWK', 'PPG', 'ADM', 'BEN', 'TROW', 'CINF',
    'AOS', 'NUE', 'LEG', 'WST', 'PNR', 'CTAS', 'SBUX', 'ECL', 'HRL', 'MKC',
    'BF-B', 'ROP', 'MDT', 'AFL', 'EXPD', 'GRMN', 'IBM', 'SPGI', 'CLX', 'FRT'
  ],

  // 혁신 성장주 (ARK 스타일)
  innovationGrowth: [
    'PLTR', 'SNOW', 'CRWD', 'NET', 'DDOG', 'ZS', 'MDB', 'ANET', 'SMCI', 'ENPH',
    'RBLX', 'U', 'OKTA', 'NOW', 'VEEV', 'TDOC', 'SHOP', 'XYZ', 'ROKU',
    'PTON', 'Z', 'OPEN', 'DNA', 'TWLO', 'FSLY', 'CFLT', 'S', 'MNDY', 'ASAN'
  ],

  // 섹터 대표 우량주
  sectorLeaders: [
    // 금융
    'JPM', 'V', 'MA', 'GS', 'BAC', 'MS', 'BLK', 'AXP', 'C', 'WFC',
    // 헬스케어
    'UNH', 'LLY', 'JNJ', 'ABBV', 'PFE', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY',
    // 에너지
    'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'MPC', 'VLO', 'PSX', 'KMI',
    // 산업
    'CAT', 'HON', 'UPS', 'BA', 'GE', 'RTX', 'LMT', 'DE', 'NOC', 'CSX',
    // 소비재
    'HD', 'COST', 'NKE', 'MCD', 'LOW', 'TGT', 'SBUX', 'BKNG', 'LULU', 'F',
    // 통신/유틸리티
    'VZ', 'T', 'TMUS', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE'
  ],

  // 한국인 인기 미국주식 (ETF + 개별주)
  koreanFavorites: [
    'SOXL', 'TQQQ', 'SCHD', 'VOO', 'QQQ', 'SPY',
    'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META'
  ],

  // 소형 가치주 (Small-Mid Cap Value)
  smallMidCap: [
    'VICI', 'STAG', 'EPR', 'OHI', 'MPW', 'NXRT', 'CUBE', 'EXR', 'PSA', 'LSI',
    'DY', 'MTZ', 'PRIM', 'EME', 'APG', 'GVA', 'ROAD', 'TTEK', 'TRC', 'FIX',
    'SM', 'DVN', 'MUR', 'CNX', 'CRC', 'GPOR', 'RRC', 'SWN', 'CTRA'
  ],
};

// ─── 전체 티커 목록 (중복 제거) ─────────────────────────────────

export const ALL_TICKERS: string[] = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'BRK-B', 'WMT',
  'JPM', 'V', 'UNH', 'LLY', 'XOM', 'JNJ', 'PG', 'MA', 'HD', 'CVX',
  // Dow Jones additions
  'AMGN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'DIS', 'DOW', 'GS', 'HON',
  'IBM', 'INTC', 'KO', 'MCD', 'MMM', 'MRK', 'NKE', 'TRV', 'VZ',
  // Nasdaq 100 additions
  'PEP', 'COST', 'NFLX', 'AMD', 'ADBE', 'TMUS', 'QCOM', 'INTU', 'AMAT', 'TXN',
  'CMCSA', 'BKNG', 'ISRG', 'SBUX', 'AMGN', 'MDLZ', 'GILD', 'ADI', 'ADP',
  'VRTX', 'PANW', 'MU', 'LRCX', 'KLAC', 'REGN', 'SNPS', 'CDNS', 'ASML', 'NXPI',
  'CSX', 'FTNT', 'MRVL', 'FANG', 'DXCM', 'WDAY', 'ORLY', 'MAR', 'AEP',
  // Dividend Aristocrats additions
  'APD', 'O', 'KMB', 'SWK', 'PPG', 'ADM', 'BEN', 'TROW', 'CINF',
  'AOS', 'NUE', 'LEG', 'WST', 'PNR', 'CTAS', 'ECL', 'HRL', 'MKC', 'ROP',
  'MDT', 'AFL', 'EXPD', 'GRMN', 'SPGI', 'CLX', 'FRT',
  // Innovation Growth
  'PLTR', 'SNOW', 'CRWD', 'NET', 'DDOG', 'ZS', 'MDB', 'ANET', 'SMCI', 'ENPH',
  'RBLX', 'U', 'OKTA', 'NOW', 'VEEV', 'TDOC', 'SHOP', 'XYZ', 'ROKU',
  // Sector Leaders additions
  'BAC', 'MS', 'BLK', 'C', 'WFC', 'ABBV', 'PFE', 'MRK', 'TMO', 'DHR',
  'BMY', 'COP', 'EOG', 'SLB', 'OXY', 'MPC', 'VLO', 'PSX', 'KMI',
  'HON', 'UPS', 'GE', 'RTX', 'LMT', 'DE', 'NOC', 'NKE', 'BKNG', 'LULU',
  'T', 'NEE', 'DUK', 'SO', 'D', 'EXC', 'SRE',
  // Korean Favorites ETF
  'SOXL', 'TQQQ', 'SCHD', 'VOO', 'QQQ', 'SPY',
  // Small-Mid Cap
  'VICI', 'STAG', 'CUBE', 'EXR', 'PSA', 'DY', 'SM', 'DVN',
  // User-added US stocks (2026-06-11) — 미국 거래소 상장 개별주만
  'BMNR', 'TEM', 'QBTS', 'OKLO', 'SMR', 'RXRX', 'HIMS', 'IREN', 'NVTS', 'CRWV',
  'RKLB', 'CRCL', 'SOFI', 'JOBY', 'ORCL', 'ONDS', 'PBR', 'LMND', 'WDC', 'ASTS',
  'NBIS', 'LPTH', 'ALMU', 'AEHR',
  // User-added ETFs (2026-06-11)
  'XOVR', 'VCX',
].filter((v, i, a) => a.indexOf(v) === i).sort();

// ─── 종목명 매핑 ─────────────────────────────────────────────

export const STOCK_NAMES: Record<string, string> = {
  // 대형 기술주
  'AAPL': 'Apple', 'MSFT': 'Microsoft', 'GOOGL': 'Alphabet', 'AMZN': 'Amazon',
  'NVDA': 'NVIDIA', 'META': 'Meta Platforms', 'TSLA': 'Tesla', 'AVGO': 'Broadcom',
  'BRK-B': 'Berkshire Hathaway', 'WMT': 'Walmart',

  // 금융
  'JPM': 'JPMorgan Chase', 'V': 'Visa', 'MA': 'Mastercard', 'GS': 'Goldman Sachs',
  'BAC': 'Bank of America', 'MS': 'Morgan Stanley', 'BLK': 'BlackRock',
  'AXP': 'American Express', 'C': 'Citigroup', 'WFC': 'Wells Fargo',

  // 헬스케어
  'UNH': 'UnitedHealth', 'LLY': 'Eli Lilly', 'JNJ': 'Johnson & Johnson',
  'ABBV': 'AbbVie', 'PFE': 'Pfizer', 'MRK': 'Merck', 'TMO': 'Thermo Fisher',
  'ABT': 'Abbott Labs', 'DHR': 'Danaher', 'BMY': 'Bristol Myers Squibb',
  'AMGN': 'Amgen', 'MDT': 'Medtronic', 'GILD': 'Gilead Sciences',
  'VRTX': 'Vertex Pharma', 'REGN': 'Regeneron', 'BIIB': 'Biogen',

  // 에너지
  'XOM': 'Exxon Mobil', 'CVX': 'Chevron', 'COP': 'ConocoPhillips',
  'EOG': 'EOG Resources', 'SLB': 'Schlumberger', 'OXY': 'Occidental Petroleum',
  'MPC': 'Marathon Petroleum', 'VLO': 'Valero', 'PSX': 'Phillips 66',
  'KMI': 'Kinder Morgan',

  // 산업
  'CAT': 'Caterpillar', 'HON': 'Honeywell', 'UPS': 'United Parcel Service',
  'BA': 'Boeing', 'GE': 'General Electric', 'RTX': 'Raytheon',
  'LMT': 'Lockheed Martin', 'DE': 'Deere & Co', 'NOC': 'Northrop Grumman',
  'CSX': 'CSX Corp', 'MMM': '3M', 'EMR': 'Emerson Electric',
  'ITW': 'Illinois Tool Works', 'DOV': 'Dover', 'GD': 'General Dynamics',

  // 소비재
  'HD': 'Home Depot', 'COST': 'Costco', 'NKE': 'Nike', 'MCD': "McDonald's",
  'LOW': "Lowe's", 'TGT': 'Target', 'SBUX': 'Starbucks', 'BKNG': 'Booking Holdings',
  'LULU': 'Lululemon', 'NFLX': 'Netflix', 'DIS': 'Disney', 'PG': 'Procter & Gamble',
  'KO': 'Coca-Cola', 'PEP': 'PepsiCo', 'CL': 'Colgate-Palmolive', 'KMB': 'Kimberly-Clark',

  // 통신/유틸리티
  'VZ': 'Verizon', 'T': 'AT&T', 'TMUS': 'T-Mobile', 'NEE': 'NextEra Energy',
  'DUK': 'Duke Energy', 'SO': 'Southern Co', 'D': 'Dominion Energy',
  'AEP': 'American Electric', 'EXC': 'Exelon', 'SRE': 'Sempra Energy',

  // 반도체/기술
  'AMD': 'AMD', 'QCOM': 'Qualcomm', 'CSCO': 'Cisco', 'ADBE': 'Adobe',
  'INTC': 'Intel', 'INTU': 'Intuit', 'AMAT': 'Applied Materials', 'TXN': 'Texas Instruments',
  'MU': 'Micron', 'LRCX': 'Lam Research', 'KLAC': 'KLA Corp', 'SNPS': 'Synopsys',
  'CDNS': 'Cadence', 'ASML': 'ASML Holding', 'NXPI': 'NXP Semiconductors',
  'MRVL': 'Marvell', 'FTNT': 'Fortinet', 'PANW': 'Palo Alto Networks',
  'ANET': 'Arista Networks', 'SMCI': 'Super Micro Computer',

  // 혁신 성장
  'PLTR': 'Palantir', 'SNOW': 'Snowflake', 'CRWD': 'CrowdStrike', 'NET': 'Cloudflare',
  'DDOG': 'Datadog', 'ZS': 'Zscaler', 'MDB': 'MongoDB', 'ENPH': 'Enphase Energy',
  'RBLX': 'Roblox', 'U': 'Unity', 'OKTA': 'Okta',
  'NOW': 'ServiceNow', 'VEEV': 'Veeva', 'TDOC': 'Teladoc', 'SHOP': 'Shopify',
  'XYZ': 'Block', 'ROKU': 'Roku', 'ZM': 'Zoom',

  // 미디어/통신
  'CMCSA': 'Comcast', 'CHTR': 'Charter Communications', 'FOX': 'Fox Corp',
  'SPOT': 'Spotify', 'TWLO': 'Twilio',

  // 금융 서비스
  'SPGI': 'S&P Global', 'ICE': 'Intercontinental Exchange', 'CME': 'CME Group',
  'MCO': "Moody's", 'FIS': 'Fidelity National', 'FISV': 'Fiserv',

  // 부동산/REITs
  'O': 'Realty Income', 'AMT': 'American Tower', 'CCI': 'Crown Castle',
  'PLD': 'Prologis', 'PSA': 'Public Storage', 'WELL': 'Welltower',
  'EQIX': 'Equinix', 'DLR': 'Digital Realty',

  // ETF
  'SOXL': 'SOXL (반도체 3배)', 'TQQQ': 'TQQQ (나스닥 3배)', 'SCHD': 'SCHD (배당)',
  'VOO': 'VOO (S&P500)', 'QQQ': 'QQQ (나스닥100)', 'SPY': 'SPY (S&P500)',

  // 소형/중형주
  'VICI': 'VICI Properties', 'STAG': 'Stag Industrial', 'CUBE': 'CubeSmart',
  'EXR': 'Extra Space Storage', 'DY': 'Dycom', 'SM': 'SM Energy',
  'DVN': 'Devon Energy',

  // 다우존스 특수
  'DOW': 'Dow Inc', 'IBM': 'IBM', 'TRV': 'Travelers',

  // 그 외
  'ADI': 'Analog Devices', 'ADP': 'Automatic Data Processing',
  'APD': 'Air Products', 'SWK': 'Stanley Black & Decker',
  'PPG': 'PPG Industries', 'ADM': 'Archer-Daniels-Midland', 'BEN': 'Franklin Resources',
  'TROW': 'T. Rowe Price', 'CINF': 'Cincinnati Financial', 'AOS': 'A. O. Smith',
  'NUE': 'Nucor', 'LEG': 'Leggett & Platt', 'WST': 'West Pharmaceutical',
  'PNR': 'Pentair', 'CTAS': 'Cintas', 'ECL': 'Ecolab', 'HRL': 'Hormel Foods',
  'MKC': 'McCormick', 'ROP': 'Roper Technologies', 'AFL': 'Aflac',
  'EXPD': 'Expeditors', 'GRMN': 'Garmin', 'CLX': 'Clorox', 'FRT': 'Federal Realty',
  'FANG': 'Diamondback Energy', 'DXCM': 'Dexcom', 'WDAY': 'Workday',
  'ORLY': "O'Reilly Automotive", 'MAR': 'Marriott',
  'CFLT': 'Confluent', 'S': 'SentinelOne', 'MNDY': 'Monday.com', 'ASAN': 'Asana',

  // User-added US stocks (2026-06-11)
  'BMNR': 'BitMine Immersion', 'TEM': 'Tempus AI', 'QBTS': 'D-Wave Quantum',
  'OKLO': 'Oklo', 'SMR': 'NuScale Power', 'RXRX': 'Recursion Pharmaceuticals',
  'HIMS': 'Hims & Hers Health', 'IREN': 'IREN', 'NVTS': 'Navitas Semiconductor',
  'CRWV': 'CoreWeave', 'RKLB': 'Rocket Lab', 'CRCL': 'Circle Internet Group',
  'SOFI': 'SoFi Technologies', 'JOBY': 'Joby Aviation', 'ORCL': 'Oracle',
  'ONDS': 'Ondas Holdings', 'PBR': 'Petrobras', 'LMND': 'Lemonade',
  'WDC': 'Western Digital', 'ASTS': 'AST SpaceMobile', 'NBIS': 'Nebius Group',
  'LPTH': 'LightPath Technologies', 'ALMU': 'Aeluma', 'AEHR': 'Aehr Test Systems',

  // User-added ETFs (2026-06-11)
  'XOVR': 'XOVR (ERShares 혁신성장)', 'VCX': 'VCX (ETF)',
};

// ─── 섹터 매핑 ───────────────────────────────────────────────

export const SECTOR_MAP: Record<string, string> = {
  // Technology
  'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'META': 'Technology',
  'NVDA': 'Technology', 'AVGO': 'Technology', 'AMD': 'Technology', 'QCOM': 'Technology',
  'ADBE': 'Technology', 'CSCO': 'Technology', 'INTC': 'Technology', 'INTU': 'Technology',
  'AMAT': 'Technology', 'TXN': 'Technology', 'SNPS': 'Technology', 'CDNS': 'Technology',
  'ASML': 'Technology', 'NXPI': 'Technology', 'MRVL': 'Technology', 'FTNT': 'Technology',
  'PANW': 'Technology', 'ANET': 'Technology', 'SMCI': 'Technology', 'KLAC': 'Technology',
  'LRCX': 'Technology', 'MU': 'Technology', 'ADI': 'Technology', 'IBM': 'Technology',
  'NOW': 'Technology', 'CRM': 'Technology', 'ADP': 'Technology', 'FIS': 'Technology',
  'FISV': 'Technology', 'SNOW': 'Technology', 'DDOG': 'Technology', 'NET': 'Technology',
  'OKTA': 'Technology', 'ZS': 'Technology', 'CRWD': 'Technology',
  'PLTR': 'Technology', 'MDB': 'Technology', 'U': 'Technology', 'RBLX': 'Technology',
  'ZM': 'Technology', 'TWLO': 'Technology', 'CFLT': 'Technology', 'S': 'Technology',
  'MNDY': 'Technology', 'ASAN': 'Technology', 'WDAY': 'Technology',

  // Software (additional ones not in Technology)

  // Semiconductors (additional ones not in Technology)

  // Consumer Discretionary
  'AMZN': 'Consumer Discretionary', 'TSLA': 'Consumer Discretionary',
  'HD': 'Consumer Discretionary', 'LOW': 'Consumer Discretionary',
  'MCD': 'Consumer Discretionary', 'NKE': 'Consumer Discretionary',
  'TGT': 'Consumer Discretionary', 'BKNG': 'Consumer Discretionary',
  'LULU': 'Consumer Discretionary', 'SBUX': 'Consumer Discretionary',
  'MAR': 'Consumer Discretionary', 'NFLX': 'Consumer Discretionary',
  'DIS': 'Consumer Discretionary', 'GM': 'Consumer Discretionary',
  'F': 'Consumer Discretionary', 'TJX': 'Consumer Discretionary',
  'ROST': 'Consumer Discretionary', 'ORLY': 'Consumer Discretionary',
  'CCL': 'Consumer Discretionary', 'RCL': 'Consumer Discretionary',
  'NCLH': 'Consumer Discretionary', 'ABNB': 'Consumer Discretionary',
  'DASH': 'Consumer Discretionary', 'UBER': 'Consumer Discretionary',
  'LYFT': 'Consumer Discretionary', 'XYZ': 'Consumer Discretionary',
  'SHOP': 'Consumer Discretionary', 'ETSY': 'Consumer Discretionary',
  'ROKU': 'Consumer Discretionary', 'PTON': 'Consumer Discretionary',
  'Z': 'Consumer Discretionary', 'OPEN': 'Consumer Discretionary',
  'GPC': 'Consumer Discretionary', 'LEG': 'Consumer Discretionary',

  // Consumer Staples
  'PG': 'Consumer Staples', 'KO': 'Consumer Staples', 'PEP': 'Consumer Staples',
  'WMT': 'Consumer Staples', 'COST': 'Consumer Staples', 'CL': 'Consumer Staples',
  'KMB': 'Consumer Staples', 'GIS': 'Consumer Staples', 'K': 'Consumer Staples',
  'CPB': 'Consumer Staples', 'CAG': 'Consumer Staples', 'HSY': 'Consumer Staples',
  'MDLZ': 'Consumer Staples', 'MKC': 'Consumer Staples', 'SJM': 'Consumer Staples',
  'HRL': 'Consumer Staples', 'TAP': 'Consumer Staples', 'BF-B': 'Consumer Staples',
  'STZ': 'Consumer Staples', 'MO': 'Consumer Staples', 'PM': 'Consumer Staples',
  'ADM': 'Consumer Staples', 'EL': 'Consumer Staples', 'CLX': 'Consumer Staples',

  // Healthcare
  'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'LLY': 'Healthcare',
  'ABBV': 'Healthcare', 'PFE': 'Healthcare', 'MRK': 'Healthcare',
  'TMO': 'Healthcare', 'ABT': 'Healthcare', 'DHR': 'Healthcare',
  'BMY': 'Healthcare', 'AMGN': 'Healthcare', 'MDT': 'Healthcare',
  'GILD': 'Healthcare', 'VRTX': 'Healthcare', 'REGN': 'Healthcare',
  'BIIB': 'Healthcare', 'BDX': 'Healthcare', 'SYK': 'Healthcare',
  'ZTS': 'Healthcare', 'ISRG': 'Healthcare', 'DXCM': 'Healthcare',
  'TDOC': 'Healthcare',

  // Financials
  'JPM': 'Financials', 'V': 'Financials', 'MA': 'Financials', 'GS': 'Financials',
  'BAC': 'Financials', 'MS': 'Financials', 'BLK': 'Financials',
  'AXP': 'Financials', 'C': 'Financials', 'WFC': 'Financials',
  'SPGI': 'Financials', 'ICE': 'Financials', 'CME': 'Financials',
  'MCO': 'Financials', 'BEN': 'Financials', 'TROW': 'Financials',
  'AFL': 'Financials', 'CINF': 'Financials', 'TRV': 'Financials',
  'AON': 'Financials', 'AJG': 'Financials', 'MMC': 'Financials',
  'PGR': 'Financials', 'CB': 'Financials', 'AIG': 'Financials',

  // Industrials
  'CAT': 'Industrials', 'HON': 'Industrials', 'UPS': 'Industrials',
  'BA': 'Industrials', 'GE': 'Industrials', 'RTX': 'Industrials',
  'LMT': 'Industrials', 'DE': 'Industrials', 'NOC': 'Industrials',
  'MMM': 'Industrials', 'EMR': 'Industrials', 'ITW': 'Industrials',
  'DOV': 'Industrials', 'GD': 'Industrials', 'CSX': 'Industrials',
  'UNP': 'Industrials', 'NSC': 'Industrials', 'FDX': 'Industrials',
  'LHX': 'Industrials', 'TDG': 'Industrials', 'SWK': 'Industrials',
  'PPG': 'Industrials', 'APD': 'Industrials', 'ECL': 'Industrials',
  'CTAS': 'Industrials', 'ROP': 'Industrials', 'EXPD': 'Industrials',
  'DY': 'Industrials',

  // Energy
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'EOG': 'Energy',
  'SLB': 'Energy', 'OXY': 'Energy', 'MPC': 'Energy', 'VLO': 'Energy',
  'PSX': 'Energy', 'KMI': 'Energy', 'WMB': 'Energy', 'OKE': 'Energy',
  'EPD': 'Energy', 'MPLX': 'Energy', 'ET': 'Energy', 'ENB': 'Energy',
  'TRP': 'Energy', 'FANG': 'Energy', 'DVN': 'Energy',
  'SM': 'Energy', 'CTRA': 'Energy',

  // Communications (additional ones not in Technology)
  'VZ': 'Communications', 'T': 'Communications', 'TMUS': 'Communications', 'CHTR': 'Communications',
  'FOX': 'Communications', 'SPOT': 'Communications',
  'TTWO': 'Communications', 'EA': 'Communications', 'ATVI': 'Communications',

  // Utilities
  'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities', 'D': 'Utilities',
  'AEP': 'Utilities', 'EXC': 'Utilities', 'SRE': 'Utilities',
  'XEL': 'Utilities', 'ES': 'Utilities', 'WEC': 'Utilities',
  'PEG': 'Utilities', 'ED': 'Utilities', 'AEE': 'Utilities',
  'ETR': 'Utilities', 'FE': 'Utilities', 'NI': 'Utilities',

  // Real Estate
  'AMT': 'Real Estate', 'CCI': 'Real Estate', 'PLD': 'Real Estate',
  'PSA': 'Real Estate', 'WELL': 'Real Estate', 'EQIX': 'Real Estate',
  'DLR': 'Real Estate', 'O': 'Real Estate', 'VTR': 'Real Estate',
  'VICI': 'Real Estate', 'STAG': 'Real Estate', 'CUBE': 'Real Estate',
  'EXR': 'Real Estate', 'LSI': 'Real Estate', 'FRT': 'Real Estate',

  // Materials
  'LIN': 'Materials', 'SHW': 'Materials',
  'FCX': 'Materials', 'NEM': 'Materials', 'DOW': 'Materials',
  'DD': 'Materials', 'NUE': 'Materials', 'STLD': 'Materials',
  'VMC': 'Materials', 'MLM': 'Materials',

  // ETF
  'SOXL': 'ETF', 'TQQQ': 'ETF', 'SCHD': 'ETF', 'VOO': 'ETF',
  'QQQ': 'ETF', 'SPY': 'ETF',

  // User-added US stocks (2026-06-11)
  'BMNR': 'Technology', 'TEM': 'Healthcare', 'QBTS': 'Technology',
  'OKLO': 'Utilities', 'SMR': 'Utilities', 'RXRX': 'Healthcare',
  'HIMS': 'Healthcare', 'IREN': 'Technology', 'NVTS': 'Technology',
  'CRWV': 'Technology', 'RKLB': 'Industrials', 'CRCL': 'Financials',
  'SOFI': 'Financials', 'JOBY': 'Industrials', 'ORCL': 'Technology',
  'ONDS': 'Industrials', 'PBR': 'Energy', 'LMND': 'Financials',
  'WDC': 'Technology', 'ASTS': 'Communications', 'NBIS': 'Technology',
  'LPTH': 'Technology', 'ALMU': 'Technology', 'AEHR': 'Technology',

  // User-added ETFs (2026-06-11)
  'XOVR': 'ETF', 'VCX': 'ETF',
};

// ─── 유틸리티 함수 ───────────────────────────────────────────

/**
 * 중복 제거된 전체 티커 목록 반환
 */
export function getAllTickers(): string[] {
  return ALL_TICKERS;
}

/**
 * 카테고리별 티커 목록 반환
 */
export function getUniverseByCategory(category: string): string[] {
  return STOCK_UNIVERSE[category] || [];
}

/**
 * 티커가 속한 카테고리 반환
 */
export function getCategoryForTicker(ticker: string): string {
  for (const [cat, tickers] of Object.entries(STOCK_UNIVERSE)) {
    if (tickers.includes(ticker)) return cat;
  }
  return 'other';
}

/**
 * ETF 여부 판단
 */
export function isETF(ticker: string): boolean {
  return STOCK_UNIVERSE.koreanFavorites.includes(ticker) && ['SOXL', 'TQQQ', 'SCHD', 'VOO', 'QQQ', 'SPY'].includes(ticker);
}

/**
 * 섹터 반환
 */
export function getSector(ticker: string): string {
  return SECTOR_MAP[ticker] || 'Other';
}

/**
 * 총 종목 수
 */
export function getTotalStockCount(): number {
  return ALL_TICKERS.length;
}

export function getScreeningUniverseMeta(): ScreeningUniverseMeta {
  return {
    label: 'S&P500 Top 100 + Dow 30 + Nasdaq Top 50',
    totalCandidates: getTotalStockCount(),
    rankingBasis: 'latest-analysis-score',
    segments: ['sp500Top100', 'dowJones30', 'nasdaqTop50'],
  };
}

/**
 * 섹터별 종목 수
 */
export function getSectorCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  ALL_TICKERS.forEach(ticker => {
    const sector = getSector(ticker);
    counts[sector] = (counts[sector] || 0) + 1;
  });
  return counts;
}
