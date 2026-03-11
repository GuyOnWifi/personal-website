"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

interface StarProps {
  id?: number;
  top: string;
  left: string;
  size: string;
  duration: number;
  delay: number;
}

const Star: React.FC<StarProps> = ({ top, left, size, duration, delay }) => (
  <motion.div
    className="absolute rounded-full bg-white"
    style={{ top, left, width: size, height: size }}
    animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.2, 1] }}
    transition={{
      duration,
      delay,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
);

interface NodeProps {
  cx: string | number;
  cy: string | number;
}

const ConstellationNode: React.FC<NodeProps> = ({ cx, cy }) => (
  <motion.circle
    cx={cx}
    cy={cy}
    r="3"
    fill="white"
    animate={{ opacity: [0.5, 1, 0.5], r: [2, 4, 2] }}
    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    style={{ filter: "drop-shadow(0px 0px 4px rgba(255, 255, 255, 0.8))" }}
  />
);

export default function Hero() {
  const [stars, setStars] = useState<StarProps[]>([]);
  const [height, setHeight] = useState(1000);

  useEffect(() => {
    // Generate random background stars
    const generateStars = () => {
      const newStars = [];
      for (let i = 0; i < 150; i++) {
        newStars.push({
          id: i,
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
          size: Math.random() * 2 + 1 + "px",
          duration: Math.random() * 3 + 2, // 2 to 5 seconds
          delay: Math.random() * 5,
        });
      }
      setStars(newStars);
    };

    generateStars();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setHeight(document.documentElement.clientHeight);
    };
    
    // Initial set
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ViewBox coordinates for the constellation. (0,0) to (1000, 500)
  // Scaling it roughly to match the screen's aspect ratio and center it.

  // Coordinates based approximately on the image
  // e (lowercase)
  const ePath = "M 320 260 L 260 260 L 250 220 L 300 190 L 330 220 L 280 230";

  // a
  const aPath =
    "M 420 260 L 380 260 L 370 220 L 410 190 L 440 220 L 430 260 M 440 220 L 450 260";

  // s
  const sPath = "M 480 260 L 530 240 L 490 220 L 540 190";

  // o
  const oPath = "M 610 190 L 580 220 L 600 260 L 640 240 Z";

  // n
  const nPath = "M 680 260 L 680 190 L 730 220 L 730 260";

  // lone star roughly on the upper right
  const loneStar = { x: 880, y: 150 };

  const drawTransition = { duration: 3, ease: "easeInOut" as const };

  const { scrollY } = useScroll();

  return (
    <motion.div
      className="relative h-screen w-full overflow-hidden bg-gradient-to-b from-[#283655] to-[#b3a8d6]"
      style={{
        opacity: useTransform(
          () => 1 - (scrollY.get() * 1.2) / height,
        ),
      }}
    >
      {/* Background Stars */}
      {stars.map((star) => (
        <Star key={star.id} {...star} />
      ))}

      {/* Constellation SVG Container */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <svg
          className="w-full h-full max-w-5xl"
          viewBox="0 0 1000 500"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* e */}
          <motion.path
            d={ePath}
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={drawTransition}
          />
          <ConstellationNode cx="320" cy="260" />
          <ConstellationNode cx="260" cy="260" />
          <ConstellationNode cx="250" cy="220" />
          <ConstellationNode cx="300" cy="190" />
          <ConstellationNode cx="330" cy="220" />
          <ConstellationNode cx="280" cy="230" />

          {/* a */}
          <motion.path
            d={aPath}
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={drawTransition}
          />
          <ConstellationNode cx="420" cy="260" />
          <ConstellationNode cx="380" cy="260" />
          <ConstellationNode cx="370" cy="220" />
          <ConstellationNode cx="410" cy="190" />
          <ConstellationNode cx="440" cy="220" />
          <ConstellationNode cx="430" cy="260" />
          <ConstellationNode cx="450" cy="260" />

          {/* s */}
          <motion.path
            d={sPath}
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={drawTransition}
          />
          <ConstellationNode cx="480" cy="260" />
          <ConstellationNode cx="530" cy="240" />
          <ConstellationNode cx="490" cy="220" />
          <ConstellationNode cx="540" cy="190" />

          {/* o */}
          <motion.path
            d={oPath}
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={drawTransition}
          />
          <ConstellationNode cx="610" cy="190" />
          <ConstellationNode cx="580" cy="220" />
          <ConstellationNode cx="600" cy="260" />
          <ConstellationNode cx="640" cy="240" />

          {/* n */}
          <motion.path
            d={nPath}
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={drawTransition}
          />
          <ConstellationNode cx="680" cy="260" />
          <ConstellationNode cx="680" cy="190" />
          <ConstellationNode cx="730" cy="220" />
          <ConstellationNode cx="730" cy="260" />

          {/* Lone Star */}
          <ConstellationNode cx={loneStar.x} cy={loneStar.y} />
        </svg>
      </div>
      <motion.div className="absolute bottom-6 left-1/2 -translate-x-1/2" animate={{
        y: [0, 10, 0],
      }} transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
        repeatDelay: 0.5,
        delay: 2
      }}>
        <ChevronDown size={30} />
      </motion.div>
    </motion.div>
  );
}
