const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = 3000;

app.use(express.json());

const cors = require("cors");
app.use(cors());

const pool = new Pool({
	user: "postgres",
	host: "localhost",
	database: "restauranttest",
	password: "1234",
	port: 5432,
});

pool
	.connect()
	.then(() => console.log("Connected to PostgreSQL"))
	.catch((err) => console.error("Connection error", err.stack));

app.get("/menu", async (req, res) => {
	try {
		const result = await pool.query(
			`SELECT 
        md.lang_code,
        md.title,
        md.description,
        mp.price::TEXT,
        mi.code
      FROM menu_items mi
      JOIN menu_descriptions md ON mi.id = md.item_id
      JOIN menu_prices mp ON mi.id = mp.item_id
      JOIN menu_categories mc ON mi.category_id = mc.id`
		);
		res.json(result.rows);
	} catch (err) {
		console.error(err);
		res.status(500).send("Error fetching menu items");
	}
});

app.get("/menu/:category", async (req, res) => {
	const categoryMap = {
		combo: "Combo",
		main: "Main Dishes",
		soupnoodles: "Soup & Noodles",
		dessertsdrinks: "Desserts & Drinks",
		specialsextras: "Specials & Extras",
	};
	const categoryName = categoryMap[req.params.category];
	if (!categoryName) return res.status(400).send("Invalid category");

	try {
		const result = await pool.query(
			`SELECT 
        md.lang_code,
        md.title,
        md.description,
        mp.price::TEXT,
        mi.code
      FROM menu_items mi
      JOIN menu_descriptions md ON mi.id = md.item_id
      JOIN menu_prices mp ON mi.id = mp.item_id
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE mc.category_name = $1 ORDER BY md.id`,
			[categoryName]
		);
		res.json(result.rows);
	} catch (err) {
		console.error(err);
		res.status(500).send("Error fetching menu items");
	}
});

app.post("/menu", async (req, res) => {
	const { lang_code, title, description, price, code } = req.body;
	try {
		const categoryResult = await pool.query(
			`SELECT id FROM menu_categories WHERE $1 = ANY (string_to_array(lower(category_name), ' '))`,
			[code.split(".")[2]]
		);

		if (categoryResult.rows.length === 0) return res.status(400).send("Invalid category");

		const category_id = categoryResult.rows[0].id;
		const insertItem = await pool.query(`INSERT INTO menu_items (category_id, code) VALUES ($1, $2) RETURNING id`, [
			category_id,
			code,
		]);
		const item_id = insertItem.rows[0].id;

		await pool.query(`INSERT INTO menu_descriptions (item_id, lang_code, title, description) VALUES ($1, $2, $3, $4)`, [
			item_id,
			lang_code,
			title,
			description,
		]);

		await pool.query(`INSERT INTO menu_prices (item_id, price) VALUES ($1, $2)`, [item_id, price]);

		res.status(201).json({ message: "Item added successfully" });
	} catch (err) {
		console.error(err);
		res.status(500).send("Error adding menu item");
	}
});

app.put("/menu/:code/:lang_code", async (req, res) => {
	const { code, lang_code } = req.params;
	const { title, description, price } = req.body;

	try {
		const item = await pool.query(`SELECT id FROM menu_items WHERE code = $1`, [code]);
		if (item.rows.length === 0) return res.status(404).send("Item not found");

		const item_id = item.rows[0].id;
		await pool.query(
			`INSERT INTO menu_descriptions (item_id, lang_code, title, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id, lang_code)
       DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description`,
			[item_id, lang_code, title, description]
		);
		await pool.query(`UPDATE menu_prices SET price = $1 WHERE item_id = $2`, [price, item_id]);
		res.json({ message: "Item updated successfully" });
	} catch (err) {
		console.error(err);
		res.status(500).send("Error updating menu item");
	}
});

app.delete("/menu/:code", async (req, res) => {
	const { code } = req.params;
	try {
		const item = await pool.query(`SELECT id FROM menu_items WHERE code = $1`, [code]);
		if (item.rows.length === 0) return res.status(404).send("Item not found");
		const item_id = item.rows[0].id;
		await pool.query(`DELETE FROM menu_descriptions WHERE item_id = $1`, [item_id]);
		await pool.query(`DELETE FROM menu_prices WHERE item_id = $1`, [item_id]);
		await pool.query(`DELETE FROM menu_items WHERE id = $1`, [item_id]);

		res.json({ message: "Item deleted successfully" });
	} catch (err) {
		console.error(err);
		res.status(500).send("Error deleting menu item");
	}
});

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});
