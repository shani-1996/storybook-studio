export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2rem", margin: 0 }}>Personalised storybooks</h1>
      <p style={{ maxWidth: "32rem", fontSize: "1.1rem", lineHeight: 1.5 }}>
        A printed storybook starring your child. We are still building it. Please check back soon.
      </p>
    </main>
  );
}
