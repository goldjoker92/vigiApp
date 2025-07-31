// /components/SkeletonBox.jsx
import { Skeleton, Box } from "@chakra-ui/react";
export default function SkeletonBox() {
  return (
    <Box>
      {[...Array(5)].map((_, i) => <Skeleton key={i} height="30px" mb={2} />)}
    </Box>
  );
}
