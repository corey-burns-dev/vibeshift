// Centralized logger utility for the frontend
// Supports environment-specific levels and potential remote logging integration

type LogLevel = "info" | "warn" | "error" | "debug";

class Logger {
	private isDev = import.meta.env.DEV;

	private log(level: LogLevel, message: string, data?: any) {
		if (!this.isDev && level === "debug") return;

		const timestamp = new Date().toISOString();
		const formattedMsg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

		switch (level) {
			case "info":
				console.info(formattedMsg, data || "");
				break;
			case "warn":
				console.warn(formattedMsg, data || "");
				break;
			case "error":
				console.error(formattedMsg, data || "");
				break;
			case "debug":
				console.debug(formattedMsg, data || "");
				break;
		}

		// In production, you could send errors to Sentry or a custom endpoint here
		// if (level === 'error' && !this.isDev) { ... }
	}

	info(message: string, data?: any) {
		this.log("info", message, data);
	}

	warn(message: string, data?: any) {
		this.log("warn", message, data);
	}

	error(message: string, data?: any) {
		this.log("error", message, data);
	}

	debug(message: string, data?: any) {
		this.log("debug", message, data);
	}
}

export const logger = new Logger();
