import threading
import webview
from app import app   # your Flask app
import time
import base64


class Api:
    def save_pdf(self, data_uri, mode="manual"):

        print(f"PDF mode: {mode}")

        header, encoded = data_uri.split(",", 1)
        pdf_bytes = base64.b64decode(encoded)

        import os
        from datetime import datetime

        save_dir = os.path.join(
            os.path.expanduser("~"),
            "Documents"
        )

        # =========================
        # AUTO SAVE MODE
        # =========================

        mode = str(mode).strip()

        if mode.lower() != "manual":

            safe_name = (
                mode.replace(" ", "_")
                    .replace("/", "_")
                    .replace("\\", "_")
                    .replace(":", "")
            )

            filename = (
                f"{safe_name}_"
                f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            )

            file_path = os.path.join(
                save_dir,
                filename
            )

            with open(file_path, "wb") as f:
                f.write(pdf_bytes)

            print("Auto-saved to:", file_path)

            return file_path

        # =========================
        # MANUAL SAVE MODE
        # =========================
        else:

            from tkinter import filedialog
            import tkinter as tk

            root = tk.Tk()
            root.withdraw()

            file_path = filedialog.asksaveasfilename(
                defaultextension=".pdf",
                filetypes=[("PDF files", "*.pdf")],
                title="Save Hydraulic Report"
            )

            if file_path:
                with open(file_path, "wb") as f:
                    f.write(pdf_bytes)

            root.destroy()

            return file_path

def run_flask():
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)

if __name__ == "__main__":

    # run Flask in background thread
    t = threading.Thread(target=run_flask)
    t.daemon = True
    t.start()
    time.sleep(1)

    # ✅ CREATE API INSTANCE (THIS WAS MISSING)
    api = Api()

    # open desktop window
    webview.create_window(
        "Storm Solver",
        "http://127.0.0.1:5000",
        width=1200,
        height=800,
        resizable=True,
        confirm_close=True,
        text_select=True,
        js_api=api   # 👈 THIS is the key line
    )

    webview.start(gui="edgechromium")