// ================================================================
// SHOPPING DATA - the built-in starting point. Your own meal list
// (uploaded from Excel on the Shopping tab) replaces DEFAULT_MEAL_BOOK
// and is saved to your account.
//
// Meal: { name, type: 'Prep'|'Dinner'|'Snack', makes (snacks: '12 muffins'), cuisine, serves (recipe makes),
//         usually (serves you normally make), bases: [[base name, amount]],
//         ings: [[item, qty, unit]] }   qty null = "some" (to taste/serve)
// Base: { name, per (one batch makes), unit ('ml'|'cup'|'batch'), note, ings }
// Item: { name, kind: 'fresh'|'stockpile', section, store, regular }
// ================================================================

// Supermarket sections, in a typical walk-through order. The aisle
// number at your store is set on the Shopping tab.
const SHOP_SECTIONS = ["Fruit & Veg", "Bakery", "Deli", "Meat", "Rice & Pasta", "International", "Herbs & Spices", "Canned & Jarred", "Stock", "Oils, Vinegar & Sauces", "Baking", "Breakfast & Spreads", "Snacks & Nuts", "Cleaning & Laundry", "Paper & Wraps", "Dairy & Eggs", "Freezer", "Liquor", "Other"];

const SHOP_STORES = ['Woolworths', 'Amazon', 'BWS'];

const SHOP_UNITS = ['', 'g', 'ml', 'tsp', 'tbsp', 'cup', 'can', 'jar', 'packet', 'bunch', 'clove', 'slice', 'stalk', 'sprig', 'leaf', 'cube', 'sheet', 'sachet', 'batch'];

const DEFAULT_SHOP_ITEMS = [
{
"name": "Onions",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Red onion",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Garlic",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Ginger",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Bird's eye chillies",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Limes",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Lemons",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Red capsicum",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Tomatoes",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Cabbage (or iceberg lettuce)",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Carrots",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Celery",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Potatoes",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Baby potatoes",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Mushrooms",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Baby spinach",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Coriander",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Parsley",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Rosemary",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Basil",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Lemongrass",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Eschallots",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Spring onions",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Curry leaves",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Pumpkin",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Green beans",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Corn cobs",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Lebanese cucumber",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Avocado (or guacamole)",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Dill (or mint)",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Chicken breast",
"kind": "fresh",
"section": "Meat",
"store": "Woolworths",
"regular": true
},
{
"name": "Beef mince",
"kind": "fresh",
"section": "Meat",
"store": "Woolworths",
"regular": true
},
{
"name": "Diced beef",
"kind": "fresh",
"section": "Meat",
"store": "Woolworths",
"regular": false
},
{
"name": "Crumbed chicken schnitzels",
"kind": "fresh",
"section": "Meat",
"store": "Woolworths",
"regular": false
},
{
"name": "Bacon",
"kind": "fresh",
"section": "Deli",
"store": "Woolworths",
"regular": false
},
{
"name": "Feta",
"kind": "fresh",
"section": "Deli",
"store": "Woolworths",
"regular": false
},
{
"name": "Eggs",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": true
},
{
"name": "Milk",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": true
},
{
"name": "Butter",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": true
},
{
"name": "Greek yoghurt",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": true
},
{
"name": "Cream",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": false
},
{
"name": "Sour cream",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": false
},
{
"name": "Grated cheese",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": true
},
{
"name": "Mozzarella",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": false
},
{
"name": "Parmesan",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": true
},
{
"name": "Cheese slices",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": false
},
{
"name": "Filo pastry",
"kind": "fresh",
"section": "Dairy & Eggs",
"store": "Woolworths",
"regular": false
},
{
"name": "White bread",
"kind": "fresh",
"section": "Bakery",
"store": "Woolworths",
"regular": true
},
{
"name": "Pita breads",
"kind": "fresh",
"section": "Bakery",
"store": "Woolworths",
"regular": false
},
{
"name": "Burger buns",
"kind": "fresh",
"section": "Bakery",
"store": "Woolworths",
"regular": false
},
{
"name": "Green capsicum",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Cherry tomatoes",
"kind": "fresh",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": false
},
{
"name": "Kaffir lime leaves",
"kind": "stockpile",
"section": "Fruit & Veg",
"store": "Woolworths",
"regular": true
},
{
"name": "Salt",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Black pepper",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Black peppercorns",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "White pepper",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Garam masala",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Ground cumin",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Cumin seeds",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Ground coriander",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Coriander seeds",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Turmeric",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Cayenne / chilli powder",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Kashmiri chilli powder",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Mild curry powder",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Paprika",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Smoked paprika",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Cardamom pods",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Ground cardamom",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Cinnamon sticks",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Ground cinnamon",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Whole cloves",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Ground cloves",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Nutmeg",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Allspice",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Fennel seeds",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Fenugreek seeds",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Black mustard seeds",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Bay leaves",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Star anise",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Saffron",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Garlic powder",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Onion powder",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Dried oregano",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Dried thyme",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Dried basil",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Italian herb mix",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Chilli flakes",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Dried red chillies",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Sesame seeds",
"kind": "stockpile",
"section": "Herbs & Spices",
"store": "Woolworths",
"regular": true
},
{
"name": "Garlic & ginger paste",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Ghee",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Mango chutney",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Tamarind paste",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Coconut milk",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Fish sauce",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Soy sauce",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Dark soy sauce",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Hoisin sauce",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Oyster sauce",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Chinese cooking wine",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Sesame oil",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Chipotles in adobo",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Refried beans",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Tortillas",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Corn chips",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Tomato salsa",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Sliced jalapeños",
"kind": "stockpile",
"section": "International",
"store": "Woolworths",
"regular": true
},
{
"name": "Basmati rice",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "White rice",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Spaghetti",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Short pasta (penne, rigatoni)",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Fettuccine",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Macaroni",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Potato gnocchi",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Basil pesto",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Pasta & sauce packets",
"kind": "stockpile",
"section": "Rice & Pasta",
"store": "Woolworths",
"regular": true
},
{
"name": "Crushed tomatoes",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Diced tomatoes",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Whole peeled tomatoes",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Tomato passata",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Tomato paste",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Red kidney beans",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Black beans",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Corn kernels",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Kalamata olives",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Anchovies",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Fray Bentos pie",
"kind": "stockpile",
"section": "Canned & Jarred",
"store": "Woolworths",
"regular": true
},
{
"name": "Beef stock",
"kind": "stockpile",
"section": "Stock",
"store": "Woolworths",
"regular": true
},
{
"name": "Chicken stock",
"kind": "stockpile",
"section": "Stock",
"store": "Woolworths",
"regular": true
},
{
"name": "Beef stock cubes",
"kind": "stockpile",
"section": "Stock",
"store": "Woolworths",
"regular": true
},
{
"name": "Vegetable stock cubes",
"kind": "stockpile",
"section": "Stock",
"store": "Woolworths",
"regular": true
},
{
"name": "Cooking oil (vegetable/canola)",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Cooking oil spray",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Olive oil",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "White vinegar",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Apple cider vinegar",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Balsamic vinegar",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Red wine vinegar",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "White wine vinegar",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Worcestershire sauce",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Dijon mustard",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Burger sauce",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Tartare sauce",
"kind": "stockpile",
"section": "Oils, Vinegar & Sauces",
"store": "Woolworths",
"regular": true
},
{
"name": "Plain flour",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Cornflour",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "White sugar",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Brown sugar",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Honey",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Panko breadcrumbs",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Desiccated coconut",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Dried yeast",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Evaporated milk",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Vegemite",
"kind": "stockpile",
"section": "Breakfast & Spreads",
"store": "Woolworths",
"regular": true
},
{
"name": "Maple syrup",
"kind": "stockpile",
"section": "Breakfast & Spreads",
"store": "Woolworths",
"regular": true
},
{
"name": "Rolled oats",
"kind": "stockpile",
"section": "Breakfast & Spreads",
"store": "Woolworths",
"regular": true
},
{
"name": "Peanut butter",
"kind": "stockpile",
"section": "Breakfast & Spreads",
"store": "Woolworths",
"regular": true
},
{
"name": "Chocolate protein powder",
"kind": "stockpile",
"section": "Breakfast & Spreads",
"store": "Amazon",
"regular": true
},
{
"name": "Chocolate chips",
"kind": "stockpile",
"section": "Baking",
"store": "Woolworths",
"regular": true
},
{
"name": "Peanuts",
"kind": "stockpile",
"section": "Snacks & Nuts",
"store": "Woolworths",
"regular": true
},
{
"name": "Frozen mixed veg",
"kind": "stockpile",
"section": "Freezer",
"store": "Woolworths",
"regular": true
},
{
"name": "Frozen peas",
"kind": "stockpile",
"section": "Freezer",
"store": "Woolworths",
"regular": true
},
{
"name": "Frozen chopped spinach",
"kind": "stockpile",
"section": "Freezer",
"store": "Woolworths",
"regular": true
},
{
"name": "Frozen chips",
"kind": "stockpile",
"section": "Freezer",
"store": "Woolworths",
"regular": true
},
{
"name": "Frozen crumbed fish",
"kind": "stockpile",
"section": "Freezer",
"store": "Woolworths",
"regular": true
},
{
"name": "Frozen cannelloni",
"kind": "stockpile",
"section": "Freezer",
"store": "Woolworths",
"regular": true
},
{
"name": "Toilet paper",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Paper towel",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Bin bags",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Cling wrap",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Foil",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Baking paper",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Freezer bags",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Meal prep containers",
"kind": "stockpile",
"section": "Paper & Wraps",
"store": "Amazon",
"regular": true
},
{
"name": "Dishwashing liquid",
"kind": "stockpile",
"section": "Cleaning & Laundry",
"store": "Amazon",
"regular": true
},
{
"name": "Dishwasher tablets",
"kind": "stockpile",
"section": "Cleaning & Laundry",
"store": "Amazon",
"regular": true
},
{
"name": "Laundry liquid",
"kind": "stockpile",
"section": "Cleaning & Laundry",
"store": "Amazon",
"regular": true
},
{
"name": "Surface spray",
"kind": "stockpile",
"section": "Cleaning & Laundry",
"store": "Amazon",
"regular": true
}
];

const DEFAULT_MEAL_BOOK = {"bases":[{"name":"Mexican spiced beef mince","per":1,"unit":"batch","note":"500 g mince a batch","ings":[["Onion powder",1.0,"tsp"],["Dried oregano",1.0,"tsp"],["Salt",1.0,"tsp"],["Ground cumin",2.0,"tsp"],["Paprika",2.0,"tsp"],["Black pepper",0.25,"tsp"],["Cayenne / chilli powder",0.25,"tsp"],["Olive oil",10,"ml"],["Garlic",2.0,"clove"],["Onions",0.5,""],["Beef mince",500,"g"],["Tomato paste",2.0,"tbsp"]]},{"name":"Indian curry base gravy","per":2200,"unit":"ml","note":"about 2.2 kg a batch, enough for about 3 curries","ings":[["Cooking oil (vegetable/canola)",75,"ml"],["Garlic & ginger paste",8.0,"tsp"],["Salt",1.5,"tsp"],["Turmeric",1.0,"tsp"],["Tomato paste",4.0,"tsp"],["Whole peeled tomatoes",1,"can"],["Onions",2000,"g"],["Mild curry powder",5.0,"tsp"]]},{"name":"Basic tomato sauce","per":6,"unit":"cup","note":"about 6 cups a batch","ings":[["Crushed tomatoes",4.0,"can"],["Tomato paste",7.0,"tbsp"],["Onions",1.0,""],["Garlic",2.0,"clove"],["Bay leaves",2.0,"leaf"],["Brown sugar",1.0,"tbsp"],["Dried basil",1.0,"tbsp"],["Dried oregano",2.0,"tsp"],["Olive oil",40,"ml"],["Balsamic vinegar",1.0,"tbsp"],["Salt",1.5,"tsp"],["Black pepper",0.5,"tsp"]]},{"name":"Tikka chicken","per":1,"unit":"batch","note":"750 g chicken a batch","ings":[["Chicken breast",750,"g"],["Greek yoghurt",167,"g"],["Garlic",8.0,"clove"],["Ginger",1.25,"tbsp"],["Garam masala",1.25,"tsp"],["Salt",1.25,"tsp"],["Ground cumin",1.25,"tsp"],["Ground coriander",1.25,"tsp"],["Paprika",1.25,"tsp"],["Cooking oil (vegetable/canola)",65,"ml"],["Cayenne / chilli powder",0.125,"tsp"],["Black pepper",null,""],["Lemons",0.25,""]]}],"meals":[{"name":"Beef and Potato Curry","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Cooking oil spray",null,""],["Onions",1.0,""],["Tomatoes",1.0,""],["Garlic",4.0,"clove"],["Ginger",2.5,"tsp"],["Cumin seeds",1.25,"tsp"],["Ground cumin",2.5,"tsp"],["Ground coriander",2.5,"tsp"],["Garam masala",1.25,"tsp"],["Turmeric",1.25,"tsp"],["Cayenne / chilli powder",0.75,"tsp"],["Diced beef",750,"g"],["Baby potatoes",750,"g"],["Diced tomatoes",1,"can"],["Chicken stock",310,"ml"],["Whole cloves",5.0,""],["Cardamom pods",5.0,""],["Bay leaves",3.0,"leaf"],["Coriander",null,""],["Salt",null,""],["Black pepper",null,""]]},{"name":"Beef Mince and Pea Curry","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Cooking oil (vegetable/canola)",25,"ml"],["Onions",1.0,""],["Garlic",4.0,"clove"],["Beef mince",625,"g"],["Ground cumin",2.5,"tsp"],["Ground coriander",2.5,"tsp"],["Garam masala",2.5,"tsp"],["Turmeric",1.25,"tsp"],["Cayenne / chilli powder",1.25,"tsp"],["Diced tomatoes",1,"can"],["Tomato paste",2.5,"tbsp"],["Vegemite",1.25,"tsp"],["Lemons",0.5,""],["Apple cider vinegar",1.25,"tbsp"],["Frozen peas",175,"g"],["Salt",null,""]]},{"name":"Keema Curry","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Cooking oil (vegetable/canola)",80,"ml"],["Ginger",5.0,"tsp"],["Garlic",6.0,"clove"],["Onions",1.0,""],["Beef mince",625,"g"],["Salt",1.0,"tsp"],["Cayenne / chilli powder",1.25,"tsp"],["Garam masala",1.5,"tsp"],["Ground cumin",1.5,"tsp"],["Ground coriander",1.5,"tsp"],["Turmeric",0.75,"tsp"]]},{"name":"Chicken Madras","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Indian curry base gravy",750.0]],"ings":[["Cooking oil (vegetable/canola)",100,"ml"],["Dried red chillies",5.0,""],["Cardamom pods",5.0,""],["Garlic & ginger paste",4.0,"tbsp"],["Bird's eye chillies",5.0,""],["Ground cumin",5.0,"tsp"],["Ground coriander",1.25,"tsp"],["Turmeric",0.75,"tsp"],["Kashmiri chilli powder",2.5,"tbsp"],["Mild curry powder",2.5,"tbsp"],["Tomato passata",175,"ml"],["Chicken breast",750,"g"],["Mango chutney",2.5,"tbsp"],["Limes",1.0,""],["Garam masala",1.25,"tsp"],["Salt",null,""]]},{"name":"Beef Rogan Josh","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Indian curry base gravy",550.0]],"ings":[["Ghee",4.5,"tbsp"],["Cinnamon sticks",1.0,""],["Cardamom pods",8.0,""],["Whole cloves",5.0,""],["Salt",1.25,"tsp"],["Diced beef",950,"g"],["Paprika",2.5,"tbsp"],["Cayenne / chilli powder",1.0,"tsp"],["Ground coriander",5.0,"tsp"],["Ground cumin",5.0,"tsp"],["Turmeric",2.5,"tsp"],["Nutmeg",0.25,"tsp"],["Garam masala",2.0,"tsp"],["Fennel seeds",2.5,"tsp"],["Greek yoghurt",167,"g"]]},{"name":"Beef Vindaloo","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Indian curry base gravy",625.0]],"ings":[["Diced beef",1000,"g"],["Salt",2.0,"tsp"],["Kashmiri chilli powder",7.5,"tbsp"],["Coriander seeds",2.5,"tsp"],["Cumin seeds",4.0,"tsp"],["Whole cloves",5.0,""],["Cardamom pods",5.0,""],["Fenugreek seeds",1.25,"tsp"],["Ground cinnamon",2.5,"tsp"],["Black peppercorns",0.75,"tsp"],["Ginger",2.5,"tbsp"],["Garlic",13.0,"clove"],["Brown sugar",1.25,"tsp"],["Turmeric",0.25,"tsp"],["White vinegar",9.0,"tbsp"],["Ghee",3.5,"tbsp"],["Black mustard seeds",2.0,"tsp"],["Curry leaves",12.0,"leaf"]]},{"name":"Chicken Tikka Masala","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Tikka chicken",1.0],["Indian curry base gravy",1000.0]],"ings":[["Cooking oil (vegetable/canola)",80,"ml"],["Ghee",5.5,"tbsp"],["Salt",1.25,"tsp"],["Paprika",1.25,"tbsp"],["Cream",120,"ml"],["White sugar",1.25,"tsp"],["Turmeric",2.5,"tsp"],["Garam masala",1.25,"tbsp"],["Ground coriander",2.5,"tsp"],["Ground cumin",1.25,"tsp"],["Ground cardamom",0.125,"tsp"],["Cayenne / chilli powder",0.125,"tsp"]]},{"name":"Chicken Biryani","cuisine":"Indian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Chicken breast",750,"g"],["Greek yoghurt",165,"g"],["Cooking oil (vegetable/canola)",290,"ml"],["Garlic",6.0,"clove"],["Ginger",2.0,"tsp"],["Turmeric",0.125,"tsp"],["Ground cinnamon",0.25,"tsp"],["Cayenne / chilli powder",0.5,"tsp"],["Ground cardamom",0.5,"tsp"],["Garam masala",2.0,"tsp"],["Ground coriander",2.0,"tsp"],["Ground cumin",1.0,"tbsp"],["Paprika",2.0,"tbsp"],["Salt",2.0,"tsp"],["Salt",2.0,"tbsp"],["Whole cloves",10.0,""],["Bay leaves",5.0,"leaf"],["Star anise",1.0,""],["Cardamom pods",6.0,""],["Basmati rice",450.0,"g"],["Onions",2.0,""],["Saffron",1.0,"tsp"],["Coriander",1.0,"bunch"],["Ghee",3.5,"tbsp"]]},{"name":"Chilli Con Carne","cuisine":"Mexican","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Olive oil",25,"ml"],["Garlic",4.0,"clove"],["Onions",1.0,""],["Red capsicum",1.0,""],["Beef mince",625,"g"],["Tomato paste",4.0,"tbsp"],["Crushed tomatoes",2.0,"can"],["Red kidney beans",1,"can"],["Beef stock cubes",2.0,"cube"],["White sugar",2.0,"tsp"],["Cayenne / chilli powder",2.5,"tsp"],["Paprika",5.0,"tsp"],["Ground cumin",2.0,"tbsp"],["Garlic powder",2.5,"tsp"],["Onion powder",2.5,"tsp"],["Dried oregano",2.5,"tsp"],["Salt",2.0,"tsp"]]},{"name":"Burrito Bowls","cuisine":"Mexican","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Mexican spiced beef mince",1.25]],"ings":[["White rice",250,"g"],["Cabbage (or iceberg lettuce)",0.25,""],["Corn kernels",0.75,"can"],["Black beans",0.75,"can"],["Tomatoes",4.0,""],["Red onion",0.75,""],["Grated cheese",200.0,"g"],["Sour cream",null,""]]},{"name":"Frozen Burritos","cuisine":"Mexican","type":"Prep","makes":"","serves":8,"usually":8,"bases":[["Mexican spiced beef mince",1.0]],"ings":[["Tortillas",8.0,""],["White rice",200,"g"],["Cabbage (or iceberg lettuce)",0.25,""],["Corn kernels",0.75,"can"],["Black beans",0.75,"can"],["Grated cheese",150.0,"g"]]},{"name":"Beef Enchiladas","cuisine":"Mexican","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Mexican spiced beef mince",1.25]],"ings":[["Onion powder",1.25,"tsp"],["Garlic powder",1.25,"tsp"],["Ground cumin",1.25,"tbsp"],["Paprika",1.25,"tbsp"],["Dried oregano",1.25,"tbsp"],["Cayenne / chilli powder",1.25,"tsp"],["Olive oil",50,"ml"],["Plain flour",40,"g"],["Chicken stock",625,"ml"],["Tomato passata",500,"ml"],["Salt",0.25,"tsp"],["Black pepper",0.25,"tsp"],["Refried beans",1,"can"],["Black beans",1,"can"],["Tortillas",10.0,""],["Grated cheese",200.0,"g"]]},{"name":"Chicken Enchiladas","cuisine":"Mexican","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Tortillas",10.0,""],["Onion powder",1.25,"tsp"],["Garlic powder",1.25,"tsp"],["Salt",1.25,"tsp"],["Ground cumin",1.25,"tbsp"],["Paprika",1.25,"tbsp"],["Dried oregano",1.25,"tbsp"],["Black pepper",0.25,"tsp"],["Cayenne / chilli powder",1.0,"tsp"],["Olive oil",100,"ml"],["Plain flour",40,"g"],["Chicken stock",625,"ml"],["Tomato passata",500,"ml"],["Chicken breast",750,"g"],["Onions",1.0,""],["Garlic",3.0,"clove"],["Red capsicum",1.0,""],["Refried beans",1,"can"],["Corn kernels",1,"can"],["Grated cheese",320.0,"g"]]},{"name":"Mexican Stuffed Capsicums","cuisine":"Mexican","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Red capsicum",5.0,""],["Olive oil",25,"ml"],["Onions",1.0,""],["Garlic",3.0,"clove"],["Beef mince",375,"g"],["Tomato paste",4.0,"tbsp"],["Chicken stock",310,"ml"],["White rice",100.0,"g"],["Corn kernels",0.75,"can"],["Spring onions",1.0,"bunch"],["Mozzarella",150.0,"g"],["Cayenne / chilli powder",0.5,"tsp"],["Dried oregano",1.0,"tbsp"],["Ground cumin",2.0,"tsp"],["Ground coriander",2.0,"tsp"],["Onion powder",1.5,"tsp"],["Salt",0.75,"tsp"]]},{"name":"One Pot Mexican Chicken and Rice","cuisine":"Mexican","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Garlic powder",2.5,"tsp"],["Paprika",2.5,"tsp"],["Ground cumin",2.5,"tsp"],["Salt",2.25,"tsp"],["Cayenne / chilli powder",0.75,"tsp"],["Black pepper",null,""],["Chicken breast",1000,"g"],["Olive oil",50,"ml"],["Limes",1.5,""],["Onions",1.0,""],["Garlic",1.0,"clove"],["Red capsicum",1.0,""],["White rice",250,"g"],["Chicken stock",312,"ml"],["Tomato passata",250,"ml"],["Corn kernels",0.75,"can"],["Black beans",1,"can"]]},{"name":"Chipotle Chicken Bowls","cuisine":"Mexican","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Chicken breast",750,"g"],["Chipotles in adobo",1,"can"],["Crushed tomatoes",1,"can"],["Garlic",3.0,"clove"],["Dried oregano",1.0,"tsp"],["Ground cumin",1.0,"tsp"],["Onion powder",1.0,"tsp"],["White sugar",2.0,"tsp"],["Salt",0.75,"tsp"],["Black pepper",null,""],["Olive oil",60,"ml"],["Limes",1.0,""],["White rice",null,""]]},{"name":"Nachos","cuisine":"Mexican","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[["Mexican spiced beef mince",1.25]],"ings":[["Refried beans",1.0,"can"],["Corn chips",500,"g"],["Grated cheese",250,"g"],["Tomato salsa",1.0,"jar"],["Sour cream",null,""],["Avocado (or guacamole)",null,""],["Sliced jalapeños",null,""],["Coriander",null,""]]},{"name":"Spaghetti Bolognese","cuisine":"Italian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Olive oil",40,"ml"],["Garlic",3.0,"clove"],["Onions",1.0,""],["Beef mince",625,"g"],["Beef stock cubes",2.0,"cube"],["Crushed tomatoes",2.0,"can"],["Tomato paste",2.5,"tbsp"],["White sugar",2.5,"tsp"],["Worcestershire sauce",2.5,"tsp"],["Bay leaves",3.0,"leaf"],["Dried thyme",0.75,"tsp"],["Salt",1.0,"tsp"],["Black pepper",0.75,"tsp"],["Spaghetti",500,"g"],["Parmesan",null,""],["Parsley",null,""]]},{"name":"Carbonara","cuisine":"Italian","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[],"ings":[["Fettuccine",625,"g"],["Bacon",240,"g"],["Garlic",3.0,"clove"],["Eggs",5.0,""],["Grated cheese",375.0,"g"],["Black pepper",null,""],["Salt",null,""],["Lemons",null,""],["Parmesan",null,""]]},{"name":"Easy Mac and Cheese","cuisine":"Italian","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[],"ings":[["Macaroni",475,"g"],["Evaporated milk",1,"can"],["Plain flour",40,"g"],["Grated cheese",500.0,"g"],["Butter",25,"g"],["Dijon mustard",1.25,"tsp"],["Salt",null,""],["Black pepper",null,""]]},{"name":"Chicken Pesto Pasta with Bacon and Cream","cuisine":"Italian","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[],"ings":[["Short pasta (penne, rigatoni)",500,"g"],["Chicken breast",625,"g"],["Bacon",200,"g"],["Garlic",3.0,"clove"],["Cream",375,"ml"],["Basil pesto",0.75,"jar"],["Parmesan",60,"g"],["Olive oil",null,""],["Basil",null,""]]},{"name":"Roast Pumpkin and Creamy Basil Pesto Gnocchi","cuisine":"Italian","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[],"ings":[["Pumpkin",1000,"g"],["Tomatoes",3.0,""],["Garlic",5.0,"clove"],["Potato gnocchi",2.0,"packet"],["Italian herb mix",2.5,"tsp"],["Cream",375,"ml"],["Vegetable stock cubes",1.0,"cube"],["Basil pesto",1.0,"jar"],["Baby spinach",150.0,"g"],["Bacon",225.0,"g"],["Olive oil",null,""],["Salt",null,""],["Chilli flakes",null,""]]},{"name":"Meatballs in Tomato Sauce","cuisine":"Italian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Basic tomato sauce",3.75]],"ings":[["White bread",2,"slice"],["Onions",1.0,""],["Beef mince",625,"g"],["Eggs",1.0,""],["Parsley",0.25,"bunch"],["Garlic",3.0,"clove"],["Parmesan",30,"g"],["Salt",1.0,"tsp"],["Black pepper",0.25,"tsp"],["Olive oil",40,"ml"],["Chilli flakes",0.75,"tsp"],["Short pasta (penne, rigatoni)",500,"g"]]},{"name":"Chicken and Veg Pasta Bake","cuisine":"Italian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Basic tomato sauce",3.75]],"ings":[["Chicken breast",625,"g"],["Salt",2.75,"tsp"],["Black pepper",0.25,"tsp"],["Garlic powder",0.75,"tsp"],["Italian herb mix",2.5,"tsp"],["Short pasta (penne, rigatoni)",375,"g"],["Olive oil",25,"ml"],["Dried oregano",2.0,"tsp"],["Chilli flakes",0.75,"tsp"],["Frozen mixed veg",280,"g"],["Tomatoes",4.0,""],["Baby spinach",90,"g"],["Mozzarella",250,"g"],["Parmesan",60,"g"]]},{"name":"Chicken Cacciatore","cuisine":"Italian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[["Basic tomato sauce",2.0]],"ings":[["Chicken breast",1000,"g"],["Salt",0.75,"tsp"],["Black pepper",0.5,"tsp"],["Olive oil",25,"ml"],["Onions",1.0,""],["Rosemary",3.0,"sprig"],["Bay leaves",3.0,"leaf"],["Dried oregano",1.0,"tsp"],["Garlic",3.0,"clove"],["Anchovies",null,""],["Mushrooms",250,"g"],["Red capsicum",2.0,""],["Red wine vinegar",1.25,"tbsp"],["Chicken stock",500,"ml"],["Kalamata olives",1,"jar"]]},{"name":"Chicken Parmigiana Bake","cuisine":"Italian","type":"Dinner","makes":"","serves":5,"usually":4,"bases":[["Basic tomato sauce",1.667]],"ings":[["Chicken breast",750,"g"],["Salt",2.0,"tsp"],["Black pepper",0.833,"tsp"],["Italian herb mix",0.583,"tsp"],["Plain flour",50,"g"],["Eggs",2.0,""],["Garlic",1.0,"clove"],["Panko breadcrumbs",75,"g"],["Parmesan",105,"g"],["Cooking oil (vegetable/canola)",500,"ml"],["Basil",0.5,"bunch"],["Mozzarella",167,"g"],["Olive oil",12,"ml"]]},{"name":"Greek Chicken Yiros with Chips","cuisine":"Greek","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[],"ings":[["Chicken breast",1250,"g"],["Greek yoghurt",374,"g"],["Lemons",1.75,""],["Olive oil",100,"ml"],["Garlic",5.0,"clove"],["Dried oregano",2.0,"tbsp"],["Smoked paprika",1.25,"tsp"],["Ground cumin",1.25,"tsp"],["Salt",1.25,"tsp"],["Lebanese cucumber",1.0,""],["Dill (or mint)",0.5,"bunch"],["Potatoes",1250.0,"g"],["Pita breads",5.0,""],["Tomatoes",1.0,""],["Red onion",0.75,""],["Cabbage (or iceberg lettuce)",null,""]]},{"name":"Greek Lemon and Oregano Chicken with Rice","cuisine":"Greek","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Chicken breast",1250,"g"],["Lemons",2.0,""],["Dried oregano",2.5,"tbsp"],["Garlic",5.0,"clove"],["Salt",1.75,"tsp"],["Olive oil",40,"ml"],["Onions",1.0,""],["White rice",225.0,"g"],["Chicken stock",450,"ml"],["Black pepper",null,""]]},{"name":"Spanakopita","cuisine":"Greek","type":"Dinner","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Olive oil",12,"ml"],["Onions",1.0,""],["Garlic",1.0,"clove"],["Frozen chopped spinach",450,"g"],["Feta",175,"g"],["Eggs",2.0,""],["Nutmeg",null,""],["Salt",null,""],["Black pepper",null,""],["Filo pastry",9.0,"sheet"],["Butter",50.0,"g"]]},{"name":"Jerk Chicken with Rice and Beans","cuisine":"Caribbean","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Chicken breast",1250,"g"],["Olive oil",50,"ml"],["Soy sauce",1.25,"tbsp"],["Limes",1.0,""],["Onions",1.0,""],["Ginger",1.25,"tbsp"],["Bird's eye chillies",5.0,""],["Garlic",11.0,"clove"],["Salt",3.5,"tsp"],["Black pepper",2.5,"tsp"],["Brown sugar",4.0,"tbsp"],["Ground cinnamon",2.0,"tsp"],["Allspice",2.0,"tsp"],["Nutmeg",0.75,"tsp"],["Dried thyme",1.5,"tsp"],["White rice",350,"g"],["Coconut milk",1,"can"],["Red kidney beans",1,"can"],["Spring onions",0.5,"bunch"]]},{"name":"Lemon Chicken and Bacon Fried Rice","cuisine":"Asian","type":"Dinner","makes":"","serves":5,"usually":3,"bases":[],"ings":[["Basmati rice",375.0,"g"],["Spring onions",0.5,"bunch"],["Green beans",250,"g"],["Carrots",3.0,""],["Garlic",3.0,"clove"],["Bacon",250.0,"g"],["Eggs",3.0,""],["Soy sauce",5.0,"tbsp"],["Chicken breast",825,"g"],["Cornflour",43,"g"],["Honey",170,"g"],["Sesame seeds",2.5,"tbsp"],["Lemons",1.0,""],["Olive oil",null,""]]},{"name":"Honey Garlic Chicken","cuisine":"Asian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Chicken breast",950,"g"],["Salt",null,""],["Black pepper",null,""],["Plain flour",75,"g"],["Butter",90.0,"g"],["Garlic",4.0,"clove"],["Apple cider vinegar",3.0,"tbsp"],["Soy sauce",2.0,"tbsp"],["Honey",227,"g"],["White rice",null,""]]},{"name":"Asian Beef Mince Bowl","cuisine":"Asian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Hoisin sauce",1.25,"tbsp"],["Oyster sauce",2.5,"tbsp"],["Dark soy sauce",3.0,"tbsp"],["White sugar",2.5,"tsp"],["Sesame oil",0.75,"tsp"],["White pepper",0.25,"tsp"],["Cooking oil (vegetable/canola)",25,"ml"],["Garlic",3.0,"clove"],["Onions",1.0,""],["Beef mince",625,"g"],["Spring onions",0.75,"bunch"],["White rice",null,""]]},{"name":"Beef Massaman","cuisine":"Asian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Lemongrass",1.0,"stalk"],["Dried red chillies",8.0,""],["Eschallots",5.0,""],["Garlic",6.0,"clove"],["Ginger",1.25,"tbsp"],["Black pepper",null,""],["Ground cloves",0.75,"tsp"],["Ground cumin",1.0,"tsp"],["Nutmeg",0.125,"tsp"],["Ground coriander",1.0,"tsp"],["Ground cardamom",0.75,"tsp"],["Ground cinnamon",0.75,"tsp"],["Diced beef",875,"g"],["Beef stock",625,"ml"],["Bay leaves",3.0,"leaf"],["Cooking oil (vegetable/canola)",85,"ml"],["Coconut milk",1,"can"],["Cinnamon sticks",1.0,""],["Star anise",1.0,""],["Tamarind paste",1.25,"tsp"],["Fish sauce",1.25,"tbsp"],["White sugar",1.25,"tbsp"],["Potatoes",600,"g"],["Peanuts",35,"g"]]},{"name":"Beef Rendang","cuisine":"Asian","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Dried red chillies",12.0,""],["Onions",1.0,""],["Garlic",5.0,"clove"],["Lemongrass",4.0,"stalk"],["Ginger",3.0,"tbsp"],["Black pepper",null,""],["Cooking oil (vegetable/canola)",65,"ml"],["Diced beef",1000,"g"],["Cinnamon sticks",1.0,""],["Ground cloves",0.25,"tsp"],["Star anise",3.0,""],["Ground cardamom",0.5,"tsp"],["Coconut milk",1,"can"],["Tamarind paste",2.0,"tsp"],["Kaffir lime leaves",4.0,"leaf"],["Desiccated coconut",27,"g"],["Brown sugar",1.0,"tbsp"],["Salt",1.5,"tsp"]]},{"name":"Loaded Beef Cheeseburger Wedges","cuisine":"Comfort","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[],"ings":[["Potatoes",1250.0,"g"],["Olive oil",null,""],["Salt",null,""],["Beef mince",625,"g"],["Carrots",3.0,""],["Corn cobs",3.0,""],["Dijon mustard",2.5,"tbsp"],["Tomato paste",2.5,"tbsp"],["Smoked paprika",2.5,"tsp"],["Grated cheese",125,"g"],["Black pepper",null,""],["Tomatoes",3.0,""],["Spring onions",0.5,"bunch"],["White wine vinegar",1.25,"tsp"],["Burger sauce",125,"g"]]},{"name":"Cottage Pie","cuisine":"Comfort","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Olive oil",25,"ml"],["Garlic",3.0,"clove"],["Onions",1.0,""],["Carrots",1.0,""],["Celery",1.0,"stalk"],["Beef mince",750,"g"],["Plain flour",40.0,"g"],["Tomato paste",11.0,"tsp"],["Beef stock",625,"ml"],["Beef stock cubes",1.0,"cube"],["Worcestershire sauce",2.0,"tbsp"],["Dried thyme",1.0,"tsp"],["Bay leaves",3.0,"leaf"],["Salt",0.75,"tsp"],["Black pepper",0.5,"tsp"],["Potatoes",1250.0,"g"],["Milk",165,"ml"],["Butter",60.0,"g"],["Parmesan",20.0,"g"]]},{"name":"Mashed Potatoes","cuisine":"Sides","type":"Prep","makes":"","serves":5,"usually":5,"bases":[],"ings":[["Potatoes",1250.0,"g"],["Butter",60.0,"g"],["Milk",167,"ml"],["Salt",null,""],["Black pepper",null,""]]},{"name":"Balsamic Potatoes","cuisine":"Sides","type":"Dinner","makes":"","serves":5,"usually":2,"bases":[],"ings":[["Baby potatoes",1000,"g"],["Olive oil",50,"ml"],["Balsamic vinegar",2.5,"tbsp"],["Garlic",3.0,"clove"],["Rosemary",1.0,"sprig"],["Salt",null,""],["Black pepper",null,""]]},{"name":"Pizza Dough","cuisine":"Sides","type":"Prep","makes":"","serves":2,"usually":2,"bases":[],"ings":[["Plain flour",500.0,"g"],["Dried yeast",1,"sachet"],["White sugar",1.0,"tsp"],["Olive oil",40,"ml"],["Salt",1.5,"tsp"]]},{"name":"Chocolate Peanut Butter Balls","cuisine":"Snacks","type":"Snack","makes":"15 to 20 balls","serves":20,"usually":20,"bases":[],"ings":[["Rolled oats",135,"g"],["Peanut butter",250,"g"],["Honey",85,"g"],["Chocolate protein powder",60,"g"],["Chocolate chips",2.0,"tbsp"]]},{"name":"Egg Muffins","cuisine":"Snacks","type":"Snack","makes":"12 muffins","serves":12,"usually":12,"bases":[],"ings":[["Baby spinach",30,"g"],["Red capsicum",1.0,""],["Green capsicum",1.0,""],["Cherry tomatoes",112,"g"],["Eggs",10.0,""],["Salt",0.25,"tsp"],["Dried basil",0.25,"tsp"],["Dried oregano",0.25,"tsp"],["Black pepper",null,""],["Feta",35,"g"]]},{"name":"Burgers","cuisine":"Quick nights","type":"Dinner","serves":2,"usually":2,"bases":[],"ings":[["Beef mince",300,"g"],["Burger buns",2,""],["Cheese slices",2,"slice"],["Cabbage (or iceberg lettuce)",null,""],["Tomatoes",1,""],["Red onion",0.5,""],["Burger sauce",null,""]]},{"name":"Cannelloni","cuisine":"Quick nights","type":"Dinner","serves":2,"usually":2,"bases":[],"ings":[["Frozen cannelloni",1,"packet"]]},{"name":"Fray Bentos pie","cuisine":"Quick nights","type":"Dinner","serves":2,"usually":2,"bases":[],"ings":[["Fray Bentos pie",1,"can"],["Frozen peas",null,""]]},{"name":"Chicken parmi","cuisine":"Quick nights","type":"Dinner","serves":2,"usually":2,"bases":[],"ings":[["Crumbed chicken schnitzels",2,""],["Tomato passata",125,"ml"],["Mozzarella",100,"g"],["Frozen chips",0.5,"packet"]]},{"name":"Fish and chips","cuisine":"Quick nights","type":"Dinner","serves":2,"usually":2,"bases":[],"ings":[["Frozen crumbed fish",1,"packet"],["Frozen chips",0.5,"packet"],["Lemons",0.5,""],["Tartare sauce",null,""]]},{"name":"Packet pasta and sauce","cuisine":"Quick nights","type":"Dinner","serves":2,"usually":2,"bases":[],"ings":[["Pasta & sauce packets",2,"packet"]]},{"name":"French toast","cuisine":"Quick nights","type":"Dinner","serves":2,"usually":2,"bases":[],"ings":[["Eggs",3,""],["Milk",125,"ml"],["White bread",4,"slice"],["Ground cinnamon",null,""],["Butter",null,""],["Maple syrup",null,""]]}]};
