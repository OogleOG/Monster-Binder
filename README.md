# 🐉 Monster Binder

A cartoony **web-based monster collecting game** inspired by classics like *Fight My Monster* and trading card binders.  
Built with **HTML, CSS, and JavaScript**, no external frameworks needed.  

Players can:
- 🪙 Collect gold by battling or finding duplicate monsters  
- 📦 Buy themed packs (Basic, Premium, Ultra) from **Moggy the Merchant**  
- 🎴 Unlock 30 unique blob monsters with silly names & stats  
- 📕 Fill out their **binder album** with rarity borders and page flipping  
- ⚔️ Battle monsters in **1v1 turn-based fights** to earn rewards and XP  

---

## 🚀 Features

- **Binder Album**
  - 30 collectible monsters
  - Smooth page-flipping with progress counter
  - Locked slots show stylish card backs (??? until unlocked)

- **Shop**
  - Run by recurring shopkeeper **Moggy the Merchant**
  - 3 pack types (Basic / Premium / Ultra) with different rarity odds
  - Duplicate cards convert to gold automatically
  - Fun glow + animation effects on card reveals

- **Battle Arena**
  - Simple **1v1 turn-based battles**
  - Actions: Attack, Defend, Special
  - Rewards: +50 gold for win, +10 for loss
  - Monsters earn **XP and level up**, increasing stats

- **Economy**
  - Start with 100 gold
  - Pack costs: Basic (100), Premium (250), Ultra (500)
  - Duplicate gold refunds scale by rarity

- **Saving**
  - Progress stored in browser `localStorage` (binder, monsters, gold, XP)

- **Cartoon Assets**
  - Moggy sprite
  - Pack art for each rarity
  - Custom card backs and binder backgrounds
  - Rarity glow effects

---

## 🛠️ Installation & Running

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR-USERNAME/monster-binder.git
   cd monster-binder
