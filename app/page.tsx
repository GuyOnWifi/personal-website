import About from "@/components/About";
import Hero from "@/components/Hero";
import Experience from "@/components/Experience";
import Projects from "@/components/Projects";
import Skills from "@/components/Skills";

export default function Home() {
  return (
    <main className="w-full h-full bg-white">
      <Hero />
      <About />
      <Skills />
      <Experience />
      <Projects />
    </main>
  );
}
