// Category-specific Title/Description content templates for the "一键优化"
// feature, transcribed from the JustFab content spec the user provided.
// Pure data + a pure matching function -- no DOM access -- so this file can
// be exercised directly by tests/tests.html the same way
// shared/background-classifier.js is.
(function () {
  const templates = [
    // ---- Shoes ----
    {
      category1: "Shoes", category2: "Pumps", category3: "",
      titleFormula: { zh: "（系列）+(版型) + 风格 / 功能 + 材质 +核心卖点+品类词", en: "(Series)+(Wide Width)+Style/Feature+Material+category" },
      titleExample: "Sophia Pointed Toe Stiletto Satin Pumps",
      descriptionProperties: ["Material", "Heel Height", "Features", "Platform Height", "Closure", "Style", "Occasion", "Toe", "Size Fit", "Hardware", "Strap"],
      descriptionExample: "Elegant satin pumps designed with pointed toes and sleek stiletto heels for sophisticated occasion styling.\nMaterial: Satin\nHeel Height: 4\"\nFeatures: Slip Resistant\nClosure: Slip On\nStyle: Elegant\nOccasion: Party\nToe: Pointed Toe\nSize Fit: Regular Width\nHardware: Rhinestone Buckle\nStrap: Adjustable Strap"
    },
    {
      category1: "Shoes", category2: "Sandals", category3: "",
      titleFormula: { zh: "（系列）+(版型) + 风格 / 功能 + 材质 +凉鞋类型（Slide Sandals 一字凉拖 / Strappy Sandals 绑带凉鞋 / Wedge Sandals 坡跟凉鞋 / Thong Sandals 人字凉鞋 / Platform Sandals 厚底凉鞋 / Flat Sandals 平底凉鞋）", en: "(Series)+(Wide Width)+Style/Feature+Material+sandals type" },
      titleExample: "Ava Wide Width Strappy Raffia Wedge Sandals",
      descriptionProperties: ["Material", "Heel Height", "Features", "Platform Height", "Closure", "Style", "Pattern Style", "Occasion", "Toe", "Size Fit", "Hardware", "Strap"],
      descriptionExample: "Stylish wedge sandals designed with woven raffia straps and lightweight cushioning for effortless summer styling.\nMaterial : Raffia & Straw\nHeel Height : 3\"\nFeatures : Lightweight\nPlatform Height : 1\"\nClosure : Buckle\nStyle : Vacation\nPattern Style : Solid\nOccasion : Casual\nToe : Open Toe\nSize Fit : Wide Width\nHardware : Gold Tone Buckle\nStrap : Adjustable Strap"
    },
    {
      category1: "Shoes", category2: "Flats", category3: "",
      titleFormula: { zh: "（系列）+(版型) + 风格 / 功能 + 材质 +品类", en: "(Series)+(Wide Width)+Style/Feature+Material+category" },
      titleExample: "Luna Wide Width Bow Knit Ballet Flats",
      descriptionProperties: ["Material", "Features", "Closure", "Style", "Pattern Style", "Occasion", "Toe", "Size Fit", "Hardware", "Strap"],
      descriptionExample: "Classic ballet flats featuring soft knit fabric and bow detailing for comfortable everyday wear.\nMaterial : Knit Fabric\nFeatures : Flexible\nClosure : Slip On\nStyle : Ballet\nPattern Style : Solid\nOccasion : Casual\nToe : Round Toe\nSize Fit : Wide Width\nHardware : Bow Accent\nStrap : Slip On"
    },
    {
      category1: "Shoes", category2: "Loafers & Slip-Ons", category3: "",
      titleFormula: { zh: "（系列）+(版型) + 风格 / 功能 + 材质 +品类", en: "(Series)+(Wide Width)+Style/Feature+Material+category" },
      titleExample: "Harper Wide Width Penny Faux Leather Loafers",
      descriptionProperties: ["Material", "Features", "Platform Height", "Closure", "Style", "Occasion", "Size Fit", "Hardware"],
      descriptionExample: "Timeless loafers crafted with smooth faux leather and cushioned insoles for versatile daily styling.\nMaterial : Faux Leather\nFeatures : Cushioned\nPlatform Height : 0.5\"\nClosure : Slip On\nStyle: Classic\nOccasion: Work\nSize Fit: Wide Width\nHardware : Penny Strap"
    },
    {
      category1: "Shoes", category2: "Oxfords", category3: "",
      titleFormula: { zh: "（系列）+版型 + 功能 + 材质 + 核心卖点+品类", en: "(Series)+Wide Width+Style/Feature+Material+category" },
      titleExample: "Mason Wide Width Casual Leather Oxfords",
      descriptionProperties: ["Material", "Features", "Platform Height", "Closure", "Style", "Occasion", "Size Fit", "Hardware"],
      descriptionExample: "Classic oxford shoes designed with durable leather uppers and lightweight comfort soles for everyday wear.\nMaterial : Genuine Leather\nFeatures : Breathable\nPlatform Height : 0.5\"\nClosure : Lace Up\nStyle : Casual\nOccasion : Business Casual\nSize Fit : Wide Width\nHardware : Metal Eyelets"
    },
    {
      category1: "Shoes", category2: "Sneakers", category3: "",
      titleFormula: { zh: "（系列）+版型 + 场景 + 材质 + 核心卖点+品类", en: "(Series)+Wide Width+Style/Feature+Material+category" },
      titleExample: "Nova Wide Width Running Mesh Sneakers",
      descriptionProperties: ["Material", "Features", "Activity", "Closure", "Style", "Occasion", "Toe", "Size Fit", "Strap"],
      descriptionExample: "Lightweight running sneakers featuring breathable mesh construction and cushioned support for active lifestyles.\nMaterial : Mesh Fabric\nFeatures : Breathable\nActivity : Running\nClosure : Lace Up\nStyle : Sport\nOccasion : Outdoor\nToe : Round Toe\nSize Fit : Wide Width\nStrap : Adjustable Laces"
    },
    {
      category1: "Shoes", category2: "Boots", category3: "",
      titleFormula: { zh: "（系列）+版型 + 场景 + 材质 + 核心卖点+品类", en: "(Series)+Wide Width+Style/Feature+Material+category" },
      titleExample: "Willa Flat Western Boot",
      descriptionProperties: ["Material", "Shaft Height", "Heel Height", "Features", "Platform Height", "Calf Circumference", "Closure", "Season", "Style", "Pattern Style", "Occasion", "Toe", "Size Fit", "Hardware", "Strap"],
      descriptionExample: "Boasting a western-inspired design, a square toe, and an embroidery pattern. They are an ideal for matching with your Western style outfits.\nMaterial : Faux Leather\nHeel Height : 0.5\"\nFeatures : Ultra-Light\nPlatform Height : 0.5\"\nClosure : Pull On\nSeason : Winter\nStyle : Cowboy\nPattern Style : Solid\nOccasion : Party\nToe : Pointed-Toe\nSize Fit : Regular Width\nHardware : Buckle\nStrap : Zipper"
    },
    {
      category1: "Shoes", category2: "Slippers", category3: "",
      titleFormula: { zh: "（系列） + 场景 + 材质 + 核心卖点+品类", en: "(Series)+Style/Feature+Material+category" },
      titleExample: "Cozy Faux Fur Memory Foam Slippers",
      descriptionProperties: ["Material", "Heel Height", "Features", "Platform Height", "Closure", "Style", "Occasion", "Toe", "Size Fit", "Hardware", "Strap"],
      descriptionExample: "Soft faux fur slippers designed with cushioned memory foam soles for warm indoor comfort.\nMaterial : Faux Fur\nHeel Height : 1\"\nFeatures : Warm\nPlatform Height : 0.5\"\nClosure : Slip On\nStyle : Cozy\nOccasion : Home\nToe : Round Toe\nSize Fit : Regular Width\nHardware : None\nStrap : Open Back"
    },
    {
      category1: "Shoes", category2: "Sport", category3: "",
      titleFormula: { zh: "（系列）+版型 + 场景 + 材质 + 核心卖点+品类", en: "(Series)+Wide Width+Style/Feature+Material+category" },
      titleExample: "Aero Wide Width Training Knit Sport Shoes",
      descriptionProperties: ["Material", "Features", "Activity", "Closure", "Style", "Occasion", "Toe", "Size Fit", "Strap"],
      descriptionExample: "Performance sport shoes designed with breathable knit uppers and lightweight support for training activities.\nMaterial : Knit Fabric\nFeatures : Shock Absorbent\nActivity : Training\nClosure : Lace Up\nStyle : Athletic\nOccasion : Gym\nToe : Round Toe\nSize Fit : Wide Width\nStrap : Adjustable Laces"
    },
    // ---- Clothing ----
    {
      category1: "Clothing", category2: "Bottoms", category3: "",
      titleFormula: { zh: "（系列）+风格+关键卖点+版型+面料+品类词", en: "(Series)+Style+Key Selling Points+Fit+Fabric+Category" },
      titleExample: "Casual Stretch Straight Leg Cotton Bottoms",
      descriptionProperties: ["Material", "Features", "Pockets", "Style", "Pattern Style", "Occasion", "Rise", "Care"],
      descriptionExample: "Straight leg bottoms crafted from stretch cotton fabric with a comfortable fit for everyday styling.\nMaterial : Cotton Blend\nFeatures : Stretch\nPockets : Functional Pockets\nStyle : Casual\nPattern Style : Solid\nOccasion : Daily\nRise : High Rise\nCare : Machine Wash"
    },
    {
      category1: "Clothing", category2: "Coats & Jackets", category3: "",
      titleFormula: { zh: "（系列）面料（可增加触感词语如：Stretch/Soft/Lightweight/Cozy 等）+关键卖点（图案/设计细节）+版型+品类", en: "(Series) Fabric (add texture words: Stretch/Soft/Lightweight/Cozy etc.) + Key Selling Points (Pattern/Design Details) + Silhouette + Category" },
      titleExample: "100% Mongolian Cashmere Double-Faced Wrap Long Coat",
      descriptionProperties: ["Material", "Features", "Size Fit Type", "Style", "Occasion", "Pattern Style", "Care"],
      descriptionExample: "Wrap Belted Wool Coat designed with soft brushed fabric and an asymmetric collar for refined, polished warmth.\nMaterial: Cashmere Blend\nFeatures: Asymmetric wrap collar, self-tie belt, side pockets, tailored silhouette\nFit Type: Wrap Fit\nStyle: Elegant\nOccasion: Everyday wear, office, formal occasions\nPattern Style: Solid color\nCare: Dry Clean Recommended"
    },
    {
      category1: "Clothing", category2: "Denim", category3: "",
      titleFormula: { zh: "（系列）+风格+关键卖点+版型+面料+品类词", en: "(Series)+Style+Key Selling Points+Fit+Fabric+Category" },
      titleExample: "Vintage Distressed Skinny Denim Jeans",
      descriptionProperties: ["Material", "Features", "Pockets", "Style", "Occasion", "Rise", "Care"],
      descriptionExample: "Distressed skinny denim jeans featuring stretch fabrication and a flattering high rise silhouette.\nMaterial : Cotton Denim\nFeatures : Distressed\nPockets : Five Pocket Design\nStyle : Vintage\nOccasion : Casual\nRise : High Rise\nCare : Machine Wash"
    },
    {
      category1: "Clothing", category2: "Dresses", category3: "",
      titleFormula: { zh: "（系列）面料（可增加触感词语如：Stretch/Soft/Lightweight/Cozy 等）+关键卖点（图案/设计细节）+版型+品类", en: "(Series) Fabric (add texture words: Stretch/Soft/Lightweight/Cozy etc.) + Key Selling Points (Pattern/Design Details) + Silhouette + Category" },
      titleExample: "100% European Linen Fit & Flare Midi Dress",
      descriptionProperties: ["Material", "Features", "Size Fit Type", "Style", "Occasion", "Pattern Style", "Care"],
      descriptionExample: "Square Neck Striped Midi Dress designed with lightweight woven fabric and side pockets for breezy, everyday charm.\nMaterial: 100% Linen\nFeatures: Square neckline, gathered waist, side pockets\nFit Type: A-line Fit\nStyle: Casual\nOccasion: Everyday wear, brunch, vacation, casual outings\nPattern Style: Vertical Stripe\nCare: Hand Wash Recommended"
    },
    {
      category1: "Clothing", category2: "Intimates", category3: "",
      titleFormula: { zh: "（系列）+风格+关键卖点+场景/功能+面料+品类词", en: "(Series)+Style+Key Selling Point+Occasion/Function+Fabric+Category" },
      titleExample: "Seamless Wireless Lounge Modal",
      descriptionProperties: ["Material", "Features", "Strap", "Bra Type", "Wires", "Style", "Care"],
      descriptionExample: "Seamless wireless bra designed with soft modal fabric for lightweight comfort and everyday support.\nMaterial : Modal & Spandex\nFeatures : Seamless\nStrap : Adjustable Straps\nBra Type : Wireless Bra\nWires : Wireless\nStyle : Lounge\nCare : Hand Wash"
    },
    {
      category1: "Clothing", category2: "Pants", category3: "",
      titleFormula: { zh: "（系列）面料（可增加触感词语如：Stretch/Soft/Lightweight/Cozy 等）+关键卖点（图案/设计细节）+版型+品类", en: "(Series) Fabric (add texture words: Stretch/Soft/Lightweight/Cozy etc.) + Key Selling Points (Pattern/Design Details) + Silhouette + Category" },
      titleExample: "Linen Lightweight Patch Pocket Wide Leg Pants",
      descriptionProperties: ["Material", "Features", "Size Fit Type", "Style", "Occasion", "Pattern Style", "Care"],
      descriptionExample: "High-Waisted Linen Wide-Leg Pants designed with lightweight breathable fabric and patch pockets for relaxed, summery comfort.\nMaterial: 100% Linen\nFeatures: High waist, button closure, front patch pockets, wide leg silhouette\nFit Type: Wide-Leg Fit\nStyle: Effortless\nOccasion: Everyday wear, vacation, warm weather outings\nPattern Style: Solid color\nCare: Hand Wash Recommended"
    },
    {
      category1: "Clothing", category2: "Shorts", category3: "",
      titleFormula: { zh: "（系列）+风格+关键卖点+版型+面料+品类词", en: "(Series)+Style+Key Selling Points+Fit+Fabric+Category" },
      titleExample: "Casual Drawstring Relaxed Cotton Shorts",
      descriptionProperties: ["Material", "Features", "Pockets", "Style", "Occasion", "Rise", "Care"],
      descriptionExample: "Relaxed cotton shorts featuring adjustable drawstring waists and lightweight comfort for everyday wear.\nMaterial : Cotton Blend\nFeatures : Breathable\nPockets : Side Pockets\nStyle : Casual\nOccasion : Vacation\nRise : Mid Rise\nCare : Machine Wash"
    },
    {
      category1: "Clothing", category2: "Skirts", category3: "",
      titleFormula: { zh: "（系列）+风格+关键卖点+版型+面料+品类词", en: "(Series)+Style+Key Selling Points+Fit+Fabric+Category" },
      titleExample: "Elegant Pleated High Waist Satin Skirt",
      descriptionProperties: ["Material", "Features", "Pockets", "Style", "Occasion", "Length", "Rise", "Care"],
      descriptionExample: "Pleated satin skirt featuring a flowing silhouette and elegant high waist design for versatile styling.\nMaterial : Satin\nFeatures : Pleated\nPockets : None\nStyle : Elegant\nOccasion : Party\nLength : Midi\nRise : High Rise\nCare : Hand Wash"
    },
    {
      category1: "Clothing", category2: "Sweaters", category3: "",
      titleFormula: { zh: "（系列）+风格+关键卖点+版型+面料+品类词", en: "(Series)+Style+Key Selling Points+Fit+Fabric+Category" },
      titleExample: "Casual Oversized Cable Knit Sweater",
      descriptionProperties: ["Material", "Features", "Length", "Style", "Occasion", "Pattern Style", "Care"],
      descriptionExample: "Oversized cable knit sweater crafted with soft textured yarn for cozy cold weather styling.\nMaterial : Acrylic Blend\nFeatures : Cable Knit\nLength : Regular Sleeve\nStyle : Casual\nOccasion : Daily\nPattern Style : Solid\nCare : Machine Wash"
    },
    {
      category1: "Clothing", category2: "Hoodies", category3: "",
      titleFormula: { zh: "（系列）+风格+关键卖点+版型+面料+品类词", en: "(Series)+Style+Key Selling Points+Fit+Fabric" },
      titleExample: "Sport Fleece Relaxed Pullover Hoodie",
      descriptionProperties: ["Material", "Features", "Size Fit Type", "Style", "Occasion", "Pattern Style", "Care"],
      descriptionExample: "Relaxed fit hoodie designed with soft fleece lining and adjustable drawstrings for casual comfort.\nMaterial : Cotton Blend\nFeatures : Fleece Lined\nFit Type : Relaxed Fit\nStyle : Sport\nOccasion : Casual\nPattern Style : Graphic\nCare : Machine Wash"
    },
    {
      category1: "Clothing", category2: "Swimwear", category3: "",
      titleFormula: { zh: "（系列）关键卖点（图案/设计细节）+版型+品类", en: "(Series) Key Selling Points (Pattern/Design Details) + Silhouette + Category" },
      titleExample: "Adjustable Side-Tie Bikini Bottom",
      descriptionProperties: ["Material", "Features", "Size Fit Type", "Style", "Occasion", "Pattern Style", "Care"],
      descriptionExample: "Square Neck Bodysuit designed with smooth, stretch fabric and thin spaghetti straps for a sleek, seamless silhouette.\nMaterial: Nylon Blend\nFeatures: Square neckline, spaghetti straps\nFit Type: Form-fitting\nStyle: Minimalist\nOccasion: Summer Vacation\nPattern Style: Solid Color\nCare: Hand Wash Recommended"
    },
    {
      category1: "Clothing", category2: "Tops & T-Shirts", category3: "",
      titleFormula: { zh: "（系列）面料（可增加触感词语如：Stretch/Soft/Lightweight/Cozy 等）+关键卖点（图案/设计细节）+版型+品类", en: "(Series) Fabric (add texture words: Stretch/Soft/Lightweight/Cozy etc.) + Key Selling Points (Pattern/Design Details) + Silhouette + Category" },
      titleExample: "100% Organic Cotton Waffle Scoop Neck Tank",
      descriptionProperties: ["Material", "Features", "Size Fit Type", "Style", "Occasion", "Pattern Style", "Care"],
      descriptionExample: "Knitted Sleeveless Tank designed with textured waffle-knit fabric and ribbed trim for a polished, everyday look.\nMaterial: Cotton Blend\nFeatures: Textured waffle knit, ribbed trim at neckline\nFit Type: Relaxed fit\nStyle: Minimalist\nOccasion: Everyday wear, layering, casual outings\nPattern Style: Solid color\nCare: Machine Wash"
    },
    // ---- Bags & Accessories ----
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Belts",
      titleFormula: { zh: "（系列）+适用性别 + 材质 + 扣头类型 + 品类", en: "(Series)+Gender+Material+Buckle Type+Category" },
      titleExample: "Women Faux Leather Gold Buckle Belt",
      descriptionProperties: ["Material", "Features", "Style", "Occasion", "Buckle Type", "Pattern Style", "Hardware"],
      descriptionExample: "Classic faux leather belt featuring polished gold buckle hardware for versatile everyday styling.\nMaterial : Faux Leather\nFeatures : Adjustable\nStyle : Casual\nOccasion : Daily\nPattern Style : Solid\nHardware : Gold Tone Buckle"
    },
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Sunglasses & Eyewear",
      titleFormula: { zh: "镜片类型 + 镜框形状 + 品类", en: "Lens Type+Frame Shape+Category" },
      titleExample: "Gradient Square Sunglasses",
      descriptionProperties: ["Material", "Features", "Frame Shape", "Style", "Occasion"],
      descriptionExample: "Modern square sunglasses featuring gradient lenses and lightweight frames for stylish sun protection.\nMaterial : Metal & Plastic\nFeatures : UV Protection\nFrame Shape : Square\nStyle : Fashion\nOccasion : Vacation"
    },
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Ear Warmer",
      titleFormula: { zh: "佩戴方式 + 材质 + 品类", en: "Wearing Style+Material+Category" },
      titleExample: "Cozy Faux Fur Winter Ear Warmers",
      descriptionProperties: ["Material", "Features", "Style", "Occasion", "Pattern Style", "Season", "Care"],
      descriptionExample: "Soft faux fur ear warmers designed for lightweight warmth and comfortable cold weather protection.\nMaterial : Faux Fur\nFeatures : Warm\nStyle : Cute\nOccasion : Outdoor\nPattern Style : Solid\nSeason : Winter\nCare : Machine Wash"
    },
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Gloves",
      titleFormula: { zh: "适用性别+材质+品类", en: "Gender+Material+Category" },
      titleExample: "Women Thermal Touchscreen Knit Winter Gloves",
      descriptionProperties: ["Material", "Features", "Style", "Occasion", "Pattern Style", "Season", "Care"],
      descriptionExample: "Thermal knit gloves featuring touchscreen compatible fingertips and soft stretch comfort for winter wear.\nMaterial : Knit Fabric\nFeatures : Touchscreen Compatible\nStyle : Casual\nOccasion : Outdoor\nPattern Style : Solid\nSeason : Winter\nCare : Machine Wash"
    },
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Hair Accessories",
      titleFormula: { zh: "材质 + 适用人群+子品类词", en: "Material+Target Audience+Sub-category" },
      titleExample: "Pearl Bow Satin Hair Clip",
      descriptionProperties: ["Material", "Features", "Hair Accessories Type", "Style", "Occasion"],
      descriptionExample: "Elegant satin hair clip featuring pearl embellished bow accents for elevated everyday styling.\nMaterial : Satin\nFeatures : Pearl Embellished\nHair Accessories Type : Hair Clip\nStyle : Feminine\nOccasion : Party"
    },
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Hats",
      titleFormula: { zh: "(系列) + 季节/场景 + (颜色) + 尺寸/帽檐造型 + 材质 + 关键卖点 [功能/细节] + 核心品类", en: "(Series) + Season/Occasion + (Color) + Size/Shape/Brim + Material + Key Features [Function/Detail] + Core Style" },
      titleExample: "Women Summer Beige Wide Brim Straw Anti-UV Sun Hat",
      descriptionProperties: ["Material", "Features", "Hat Type", "Season", "Pattern Style", "Style", "Occasion"],
      descriptionExample: "Wide brim straw hat designed with lightweight woven construction for stylish sun protection.\nMaterial : Straw\nFeatures : Breathable\nHat Type : Anti-UV Sun Hat\nSeason : Summer\nPattern Style : Woven\nStyle : Vacation\nOccasion : Beach"
    },
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Scarves",
      titleFormula: { zh: "(系列) + （人群） + 季节/场景 + (颜色) + 尺寸/版型 + 材质 + 关键卖点 [图案/细节] + 核心品类", en: "(Series) + (Audience) + Season/Occasion + (Color) + Size/Shape + Material + Key Features [Pattern/Detail] + Core Style" },
      titleExample: "Women Winter Red Oversized Cashmere Scarf",
      descriptionProperties: ["Material", "Features", "Season", "Style", "Occasion"],
      descriptionExample: "Soft knit scarf featuring classic plaid patterns and fringe trim for cozy seasonal layering.\nMaterial : Acrylic Blend\nFeatures : Soft Touch\nSeason : Winter\nStyle : Plaid\nOccasion : Daily"
    },
    {
      category1: "Bags & Accessories", category2: "Accessories", category3: "Socks",
      titleFormula: { zh: "(系列) + （人群）+ 数量 +季节/场景 + 尺寸/长度 + 材质 + 关键卖点 [功能/细节] + 核心品类", en: "(Series) + (Audience) + Amount + Season/Occasion + Size/Length + Material + Key Features [Function/Detail] + Core Style" },
      titleExample: "Men Cushioned Breathable Athletic Crew Socks",
      descriptionProperties: ["Material", "Features", "Socks Type", "Season", "Style", "Occasion", "Pattern Style", "Length"],
      descriptionExample: "Athletic crew socks designed with cushioned soles and breathable stretch fabric for everyday comfort.\nMaterial : Cotton Blend\nFeatures : Cushioned\nStyle : Athletic\nOccasion : Daily\nPattern Style : Solid\nLength : 10\""
    },
    {
      category1: "Bags & Accessories", category2: "", category3: "Bag",
      titleFormula: { zh: "(系列) + （人群） + 季节/场景 + (颜色) + 尺寸/包型 + 材质 + 关键卖点 [开合/功能] + 核心品类", en: "(Series) + (Audience) + Season/Occasion + (Color) + Size/Shape + Material + Key Features [Closure/Function] + Core Style" },
      titleExample: "Luna Quilted Chain Faux Leather Bag",
      descriptionProperties: ["Material", "Features", "Season", "Style", "Occasion", "Pattern Style", "Dimensions", "Closure", "Hardware", "Strap", "Care"],
      descriptionExample: "Structured shoulder bag featuring quilted faux leather and polished chain straps for versatile styling.\nMaterial : Faux Leather\nFeatures : Quilted\nSeason : Spring\nStyle : Sport\nOccasion : Outdoor\nPattern Style : Solid\nDimensions : 10\" x 6\" x 3\"\nClosure : Magnetic Snap\nHardware : Gold Tone\nStrap : Chain Strap\nCare : Machine Wash"
    },
    // ---- Jewellery ----
    {
      category1: "Jewellery", category2: "Jewellery", category3: "",
      titleFormula: { zh: "(系列) + （人群） + （场景） + (颜色/电镀色) + 造型/风格 + 材质 + 关键卖点 [细节/镶嵌] + 核心品类", en: "(Series) + (Audience) + (Occasion) + (Color/Finish) + Shape/Style + Material + Key Features [Detail/Stone] + Core Style" },
      titleExample: "Celeste Heart Pearl Layered Necklace",
      descriptionProperties: ["Material", "Features", "Jewellery Type", "Style", "Occasion", "Pattern Style", "Hardware"],
      descriptionExample: ""
    }
  ];

  function normalizeSegment(text) {
    return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // categoryPath looks like "Fashion>>Clothing>>Intimates>>Underwear" (exact
  // separator/shape not verified against a live page -- this tolerates ">>",
  // ">" and "/" as separators, and matches from the most specific segment
  // (last) toward the least specific (first) against each template's
  // category3 (if it has one) then category2.
  function match(categoryPath) {
    const segments = String(categoryPath || "")
      .split(/>>|>|\//)
      .map(normalizeSegment)
      .filter(Boolean);
    if (!segments.length) return null;

    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = segments[i];
      const hits = templates.filter(template => {
        const leaf = normalizeSegment(template.category3 || template.category2);
        return leaf && leaf === segment;
      });
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) return null; // ambiguous -- let the caller fall back to manual selection
    }
    return null;
  }

  // Crude singularization (strip a trailing "s" on words long enough that it's
  // probably a plural, not a 3-letter word that just happens to end in "s")
  // so "Sandals"/"sandal", "Hoodies"->"hoodie" etc. line up either direction.
  function singularize(word) {
    return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
  }

  function wordsOf(text) {
    return String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(singularize);
  }

  const MATCH_STOPWORDS = new Set(["and", "the", "for", "with"]);

  // A template's leaf category name (e.g. "Loafers & Slip-Ons") broken into
  // meaningful keywords ("loafer", "slip", "on" is dropped as too short).
  function keywordsForTemplate(template) {
    const leaf = template.category3 || template.category2 || "";
    return [...new Set(
      wordsOf(leaf).filter(word => word.length >= 3 && !MATCH_STOPWORDS.has(word))
    )];
  }

  // Fallback for when the page's category breadcrumb can't be read or
  // doesn't match anything: guess the category from the product's own
  // Title/Description instead. This works because every title formula in
  // `templates` ends with the category term ("...+ category" / "...+
  // sandals type" / etc.), so a keyword hit in the *last few words of the
  // title* is a much stronger signal than the same keyword appearing
  // anywhere else -- it disambiguates cases like a Hoodies title that
  // happens to start with the word "Sport" (a style word, not the Shoes>
  // Sport category) by weighting the trailing-word hit far higher.
  function matchByText(title, description) {
    const tailWords = new Set(wordsOf(title).slice(-3));
    const allWords = new Set([...wordsOf(title), ...wordsOf(description)]);
    let best = null;
    let bestScore = 0;
    let tie = false;
    templates.forEach(template => {
      const keywords = keywordsForTemplate(template);
      if (!keywords.length) return;
      const tailHits = keywords.filter(keyword => tailWords.has(keyword)).length;
      const anyHits = keywords.filter(keyword => allWords.has(keyword)).length;
      if (!tailHits && !anyHits) return;
      const score = tailHits * 10 + anyHits;
      if (score > bestScore) {
        best = template;
        bestScore = score;
        tie = false;
      } else if (score === bestScore) {
        tie = true;
      }
    });
    return tie ? null : best;
  }

  window.EHAssistantOptimizeTemplates = { templates, normalizeSegment, match, matchByText };
})();
