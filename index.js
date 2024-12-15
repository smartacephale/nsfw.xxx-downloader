#!/usr/bin/env node
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv))
	.option("username", {
		alias: "u",
		type: "string",
		description: "Username to download posts for",
		demandOption: true,
	})
	.option("dir", {
		type: "string",
		description: "Directory to download files to",
		default: "./",
	})
	.help()
	.alias("help", "h").argv;

const userPostsURL = (n, user) =>
	`https://nsfw.xxx/page/${n}?nsfw[]=0&types[]=image&types[]=video&types[]=gallery&slider=1&jsload=1&user=${user}&_=${Date.now()}`;

async function getUserPosts(user) {
	console.log("Fetching user posts...");
	const posts = [];
	for (let i = 1; i < 100000; i++) {
		const page = await fetch(userPostsURL(i, user)).then((r) => r.text());
		if (page.length < 1) break;

		const $ = cheerio.load(page);
		const newPosts = $("a")
			.map((_, a) => $(a).attr("href"))
			.get()
			.filter((href) => href?.startsWith("https://nsfw.xxx/post"));

		posts.push(...newPosts);
	}
	return posts;
}

async function getPostsData(posts) {
  console.log("Fetching posts data...");
	const data = [];
	for (const post of posts) {
		const page = await fetch(post).then((r) => r.text());
		const $ = cheerio.load(page);

		const src =
			$(".sh-section .sh-section__image img").attr("src") ||
			$(".sh-section .sh-section__image video source").attr("src") ||
			null;

		if (!src) continue;

		const slug = post.split("post/")[1].split("?")[0];
		const date =
			$(".sh-section .sh-section__passed").first().text().replace(/ /g, "-") ||
			"";

		const ext = src.split(".").pop();
		const name = `${slug}-${date}.${ext}`;

		data.push({ name, src });
	}
	return data;
}

async function downloadFiles(data, downloadDir) {
	if (!fs.existsSync(downloadDir)) {
		fs.mkdirSync(downloadDir, { recursive: true });
	}

	for (const [index, { name, src }] of data.entries()) {
		try {
			const response = await fetch(src);
			if (!response.ok) {
				console.error(`\nFailed to download ${name}: ${response.statusText}`);
				continue;
			}

			const filePath = path.join(downloadDir, name);
			const fileStream = fs.createWriteStream(filePath);

			await new Promise((resolve, reject) => {
				response.body.pipe(fileStream);
				response.body.on("error", reject);
				fileStream.on("finish", resolve);
			});

      process.stdout.write(`\rDownloading files: ${index + 1}/${data.length}`);
		} catch (error) {
			console.error(`\nError downloading ${name}:`, error.message);
		}
	}
  console.log("");
}

async function run() {
	const user = argv.username;
	const customDir = argv.dir;
	const downloadDir = path.resolve(customDir, user);

	console.log(`Downloading files to: ${downloadDir}`);

	const posts = await getUserPosts(user);
	const postData = await getPostsData(posts);
	await downloadFiles(postData, downloadDir);
}

run();
