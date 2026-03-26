import "./globals.css";

export const metadata = {
  title: "Collisions | Meet at Bobst",
  description:
    "Collisions helps NYU students connect for focused 30-minute lunch or dinner conversations.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
