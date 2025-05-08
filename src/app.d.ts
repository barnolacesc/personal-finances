// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	// ExpenseType for consistent type usage across the app
	interface ExpenseType {
		id: number;
		amount: number;
		description: string;
		category: string;
		date: string;
	}
}

export {}; 