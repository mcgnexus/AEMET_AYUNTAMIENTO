export const metadata = {
  robots: "noindex, nofollow",
};

export default function WidgetLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
